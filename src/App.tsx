import { useEffect, useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  Banknote,
  CalendarDays,
  CreditCard,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Settings2,
  Sun,
  Trash2,
  User,
  X,
  Wallet,
} from 'lucide-react'
import { auth, db } from './lib/firebase'

type CreditCardAccount = {
  id: string
  ownerUid?: string
  bankName: string
  nickname: string
  balance: number
  closingDay: number
  paymentDay: number
  createdAt: string
}

type CardCharge = {
  id: string
  ownerUid?: string
  cardId: string
  concept: string
  amount: number
  date: string
  dueDate?: string
  purchaseGroupId?: string
  installmentNumber?: number
  installmentTotal?: number
  paid: boolean
}

type CardFormState = {
  bankName: string
  nickname: string
  balance: string
  closingDay: string
  paymentDay: string
}

type ChargeFormState = {
  cardId: string
  concept: string
  amount: string
  date: string
  purchaseType: 'single' | 'zero-rate'
  installments: string
}

type CalendarEvent = {
  dateText: string
  total: number
  cards: Array<{ id: string; label: string; amount: number }>
}

type CalendarCutoffEvent = {
  dateText: string
  cards: Array<{ id: string; label: string }>
}

type PaymentDayCardDetail = {
  id: string
  label: string
  amount: number
  assignedBalance: number
  availableBalance: number
  netBalance: number
  paymentDay: number | null
  charges: CardCharge[]
}

type PurchaseHistoryItem = {
  id: string
  cardId: string
  cardLabel: string
  concept: string
  date: string
  amount: number
  totalInstallments: number
  paidInstallments: number
  pendingInstallments: number
  isGroupedInstallment: boolean
  charges: CardCharge[]
}

const today = new Date()

const STORAGE_KEYS = {
  cards: 'miromoney.credit-cards',
  charges: 'miromoney.credit-charges',
  month: 'miromoney.calendar-month',
  theme: 'miromoney.theme',
} as const

type ThemeMode = 'light' | 'dark'

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 2,
})

const monthFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
})

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const defaultLoginEmail = import.meta.env.VITE_DEFAULT_LOGIN_EMAIL?.trim()
const defaultLoginPassword = import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD?.trim()

const toDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}

const toMonthInput = (date: Date) => toDateInput(date).slice(0, 7)

const toCalendarDate = (year: number, monthIndex: number, day: number) => {
  const normalizedDay = Math.max(1, Math.min(day, new Date(year, monthIndex + 1, 0).getDate()))
  return new Date(year, monthIndex, normalizedDay, 12, 0, 0, 0)
}

const parseSavedArray = <T,>(raw: string | null): T[] => {
  if (!raw) {
    return []
  }

  try {
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? (parsed as T[]) : []
  } catch {
    return []
  }
}

const normalizeCards = (items: unknown[]): CreditCardAccount[] => {
  return items
    .filter(
      (item): item is CreditCardAccount =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        typeof item.id === 'string' &&
        'bankName' in item &&
        typeof item.bankName === 'string' &&
        'nickname' in item &&
        typeof item.nickname === 'string' &&
        'balance' in item &&
        typeof item.balance === 'number' &&
        Number.isFinite(item.balance) &&
        'closingDay' in item &&
        Number.isInteger(item.closingDay) &&
        'paymentDay' in item &&
        Number.isInteger(item.paymentDay) &&
        'createdAt' in item &&
        typeof item.createdAt === 'string',
    )
    .map((item) => ({
      ...item,
      closingDay: Math.min(31, Math.max(1, item.closingDay)),
      paymentDay: Math.min(31, Math.max(1, item.paymentDay)),
    }))
}

const normalizeCharges = (items: unknown[]): CardCharge[] => {
  return items
    .filter(
      (item): item is CardCharge =>
        typeof item === 'object' &&
        item !== null &&
        'id' in item &&
        typeof item.id === 'string' &&
        'cardId' in item &&
        typeof item.cardId === 'string' &&
        'concept' in item &&
        typeof item.concept === 'string' &&
        'amount' in item &&
        typeof item.amount === 'number' &&
        Number.isFinite(item.amount) &&
        'date' in item &&
        typeof item.date === 'string',
    )
    .map((item) => ({
      ...item,
      dueDate: typeof item.dueDate === 'string' ? item.dueDate : undefined,
      purchaseGroupId: typeof item.purchaseGroupId === 'string' ? item.purchaseGroupId : undefined,
      installmentNumber: Number.isInteger(item.installmentNumber) ? item.installmentNumber : undefined,
      installmentTotal: Number.isInteger(item.installmentTotal) ? item.installmentTotal : undefined,
      paid: typeof item.paid === 'boolean' ? item.paid : false,
    }))
    .sort((a, b) => b.date.localeCompare(a.date))
}

const getFirebaseErrorCode = (error: unknown) => {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown')
  }

  return 'unknown'
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

const formatDueLabel = (date: Date) =>
  date.toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'short',
  })

const formatLongDate = (dateText: string) =>
  new Date(`${dateText}T12:00:00`).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })

const initialCardForm = (): CardFormState => ({
  bankName: '',
  nickname: '',
  balance: '',
  closingDay: '',
  paymentDay: '',
})

const initialChargeForm = (cards: CreditCardAccount[]): ChargeFormState => ({
  cardId: cards[0]?.id ?? '',
  concept: '',
  amount: '',
  date: toDateInput(today),
  purchaseType: 'single',
  installments: '3',
})

const loadCards = (): CreditCardAccount[] => {
  const saved = parseSavedArray<unknown>(window.localStorage.getItem(STORAGE_KEYS.cards))
  return normalizeCards(saved)
}

const loadCharges = (): CardCharge[] => {
  const saved = parseSavedArray<unknown>(window.localStorage.getItem(STORAGE_KEYS.charges))
  return normalizeCharges(saved)
}

const loadThemeMode = (): ThemeMode => {
  const savedTheme = window.localStorage.getItem(STORAGE_KEYS.theme)
  if (savedTheme === 'light' || savedTheme === 'dark') {
    return savedTheme
  }

  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  }

  return 'light'
}

const getCardDisplayName = (card: CreditCardAccount) =>
  card.nickname.trim().length > 0 ? `${card.bankName} · ${card.nickname}` : card.bankName

const normalizeInstallmentConcept = (concept: string) =>
  concept.replace(/\s+\(Cuota\s+\d+\/\d+\)$/i, '').trim()

const getDueDateForMonth = (card: CreditCardAccount, monthDate: Date) =>
  toCalendarDate(monthDate.getFullYear(), monthDate.getMonth(), card.paymentDay)

const getDueDateForCharge = (card: CreditCardAccount, chargeDateText: string) => {
  const chargeDate = new Date(`${chargeDateText}T12:00:00`)
  const chargeDay = chargeDate.getDate()

  const closingMonth = chargeDay <= card.closingDay
    ? new Date(chargeDate.getFullYear(), chargeDate.getMonth(), 1, 12, 0, 0, 0)
    : new Date(chargeDate.getFullYear(), chargeDate.getMonth() + 1, 1, 12, 0, 0, 0)

  const paymentMonth = new Date(closingMonth.getFullYear(), closingMonth.getMonth() + 1, 1, 12, 0, 0, 0)
  return toCalendarDate(paymentMonth.getFullYear(), paymentMonth.getMonth(), card.paymentDay)
}

const getInstallmentDueDate = (firstDueDate: Date, installmentIndex: number, paymentDay: number) => {
  const paymentMonth = new Date(firstDueDate.getFullYear(), firstDueDate.getMonth() + installmentIndex, 1, 12, 0, 0, 0)
  return toCalendarDate(paymentMonth.getFullYear(), paymentMonth.getMonth(), paymentDay)
}

const splitAmountByInstallments = (amount: number, installments: number) => {
  const totalCents = Math.round(amount * 100)
  const baseCents = Math.floor(totalCents / installments)
  const remainderCents = totalCents - baseCents * installments

  return Array.from({ length: installments }, (_, index) => {
    const cents = baseCents + (index < remainderCents ? 1 : 0)
    return cents / 100
  })
}

const buildCalendarMatrix = (monthDate: Date) => {
  const year = monthDate.getFullYear()
  const monthIndex = monthDate.getMonth()
  const firstDay = new Date(year, monthIndex, 1, 12, 0, 0, 0)
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate()
  const leadingEmptyDays = (firstDay.getDay() + 6) % 7
  const totalCells = leadingEmptyDays + daysInMonth
  const rows = Math.ceil(totalCells / 7) * 7

  return Array.from({ length: rows }, (_, index) => {
    const dayNumber = index - leadingEmptyDays + 1

    if (dayNumber < 1 || dayNumber > daysInMonth) {
      return null
    }

    return new Date(year, monthIndex, dayNumber, 12, 0, 0, 0)
  })
}

const App = () => {
  const [cards, setCards] = useState<CreditCardAccount[]>(() => loadCards())
  const [charges, setCharges] = useState<CardCharge[]>(() => loadCharges())
  const [isCloudSyncEnabled, setIsCloudSyncEnabled] = useState(false)
  const [isAuthChecked, setIsAuthChecked] = useState(auth ? Boolean(auth.currentUser) : true)
  const [currentUserUid, setCurrentUserUid] = useState<string | null>(auth?.currentUser?.uid ?? null)
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [isCardModalOpen, setIsCardModalOpen] = useState(false)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [isPurchasesModalOpen, setIsPurchasesModalOpen] = useState(false)
  const [isZeroRatePurchasesModalOpen, setIsZeroRatePurchasesModalOpen] = useState(false)
  const [isManageCardsModalOpen, setIsManageCardsModalOpen] = useState(false)
  const [selectedPaymentDateText, setSelectedPaymentDateText] = useState<string | null>(null)
  const [isSavingCard, setIsSavingCard] = useState(false)
  const [isSavingCharge, setIsSavingCharge] = useState(false)
  const [activePayingCardId, setActivePayingCardId] = useState<string | null>(null)
  const [isZeroRateFlow, setIsZeroRateFlow] = useState(false)
  const [isUserAuthenticated, setIsUserAuthenticated] = useState(Boolean(auth?.currentUser))
  const [currentUserLabel, setCurrentUserLabel] = useState<string | null>(auth?.currentUser?.email ?? null)
  const [isLoggingOut, setIsLoggingOut] = useState(false)
  const [isSessionMenuOpen, setIsSessionMenuOpen] = useState(false)
  const [isLoggingIn, setIsLoggingIn] = useState(false)
  const [loginError, setLoginError] = useState<string | null>(null)
  const [loginEmail, setLoginEmail] = useState(defaultLoginEmail ?? '')
  const [loginPassword, setLoginPassword] = useState(defaultLoginPassword ?? '')
  const [purchaseSearch, setPurchaseSearch] = useState('')
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => loadThemeMode())
  const sessionMenuRef = useRef<HTMLDivElement | null>(null)
  const [cardForm, setCardForm] = useState<CardFormState>(() => initialCardForm())
  const [chargeForm, setChargeForm] = useState<ChargeFormState>(() => initialChargeForm(loadCards()))
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.month)
    return saved && /^\d{4}-\d{2}$/.test(saved) ? saved : toMonthInput(today)
  })
  const isAnyModalOpen =
    isCardModalOpen ||
    isChargeModalOpen ||
    isPurchasesModalOpen ||
    isZeroRatePurchasesModalOpen ||
    isManageCardsModalOpen ||
    selectedPaymentDateText !== null

  useEffect(() => {
    if (!auth) {
      setIsUserAuthenticated(false)
      setCurrentUserUid(null)
      setCurrentUserLabel(null)
      setIsAuthChecked(true)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthChecked(true)
      setIsUserAuthenticated(Boolean(user))
      setCurrentUserUid(user?.uid ?? null)
      if (!user) {
        setCurrentUserLabel(null)
        setIsSessionMenuOpen(false)
        return
      }

      setCurrentUserLabel(user.email?.trim() || `UID ${user.uid.slice(0, 8)}`)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    if (!isSessionMenuOpen) {
      return
    }

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target
      if (!(target instanceof Node)) {
        return
      }

      if (sessionMenuRef.current && !sessionMenuRef.current.contains(target)) {
        setIsSessionMenuOpen(false)
      }
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSessionMenuOpen(false)
      }
    }

    window.addEventListener('mousedown', handleOutsideClick)
    window.addEventListener('keydown', handleEscape)

    return () => {
      window.removeEventListener('mousedown', handleOutsideClick)
      window.removeEventListener('keydown', handleEscape)
    }
  }, [isSessionMenuOpen])

  useEffect(() => {
    const loadFromFirebase = async () => {
      if (!isAuthChecked) {
        return
      }

      if (!db || !currentUserUid) {
        setIsCloudSyncEnabled(false)
        setCards([])
        setCharges([])
        return
      }

      try {
        const [cardsSnapshot, chargesSnapshot] = await Promise.all([
          getDocs(query(collection(db, 'cards'), where('ownerUid', '==', currentUserUid))),
          getDocs(query(collection(db, 'charges'), where('ownerUid', '==', currentUserUid))),
        ])

        const remoteCards = normalizeCards(
          cardsSnapshot.docs.map((snapshot) => ({
            id: snapshot.id,
            ...snapshot.data(),
          })),
        )

        const remoteCharges = normalizeCharges(
          chargesSnapshot.docs.map((snapshot) => ({
            id: snapshot.id,
            ...snapshot.data(),
          })),
        )

        setCards(remoteCards)
        setCharges(remoteCharges)
        setIsCloudSyncEnabled(true)
      } catch (error) {
        const code = getFirebaseErrorCode(error)
        if (code === 'permission-denied') {
          console.error(
            'Firestore sin permisos para cards/charges (permission-denied). Revisa Rules publicadas para usuarios autenticados.',
            error,
          )
          setIsCloudSyncEnabled(false)
          setCards([])
          setCharges([])
          return
        }

        console.error(`No se pudo cargar Firestore (${code}), se mantiene modo local.`, error)
        setIsCloudSyncEnabled(false)
        setCards([])
        setCharges([])
      }
    }

    void loadFromFirebase()
  }, [isAuthChecked, currentUserUid])

  useEffect(() => {
    if (!isAnyModalOpen) {
      return
    }

    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') {
        return
      }

      if (selectedPaymentDateText) {
        setSelectedPaymentDateText(null)
        return
      }

      if (isCardModalOpen || isChargeModalOpen) {
        return
      }
    }

    window.addEventListener('keydown', handleKeyDown)

    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isAnyModalOpen, selectedPaymentDateText, isPurchasesModalOpen, isZeroRatePurchasesModalOpen, isManageCardsModalOpen, isChargeModalOpen, isCardModalOpen, cards])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.cards, JSON.stringify(cards))
  }, [cards])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.charges, JSON.stringify(charges))
  }, [charges])

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEYS.month, selectedMonth)
  }, [selectedMonth])

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', themeMode)
    window.localStorage.setItem(STORAGE_KEYS.theme, themeMode)
  }, [themeMode])

  useEffect(() => {
    if (cards.length === 0) {
      if (chargeForm.cardId !== '') {
        setChargeForm((current) => ({ ...current, cardId: '' }))
      }
      return
    }

    const selectedCardExists = cards.some((card) => card.id === chargeForm.cardId)
    if (!selectedCardExists) {
      setChargeForm((current) => ({ ...current, cardId: cards[0].id }))
    }
  }, [cards, chargeForm.cardId])

  const cardChargesMap = useMemo(() => {
    return charges.reduce<Record<string, CardCharge[]>>((acc, charge) => {
      if (!acc[charge.cardId]) {
        acc[charge.cardId] = []
      }

      acc[charge.cardId].push(charge)
      return acc
    }, {})
  }, [charges])

  const unpaidCardChargesMap = useMemo(() => {
    return charges.reduce<Record<string, CardCharge[]>>((acc, charge) => {
      if (charge.paid) {
        return acc
      }

      if (!acc[charge.cardId]) {
        acc[charge.cardId] = []
      }

      acc[charge.cardId].push(charge)
      return acc
    }, {})
  }, [charges])

  const unpaidChargesWithDue = useMemo(() => {
    return charges
      .filter((charge) => !charge.paid)
      .map((charge) => {
        const card = cards.find((item) => item.id === charge.cardId)
        if (!card) {
          return null
        }

        const dueDate = charge.dueDate
          ? new Date(`${charge.dueDate}T12:00:00`)
          : getDueDateForCharge(card, charge.date)

        return {
          charge,
          card,
          dueDate,
          dueDateText: toDateInput(dueDate),
          dueMonthText: toMonthInput(dueDate),
        }
      })
      .filter((item): item is NonNullable<typeof item> => item !== null)
  }, [cards, charges])

  const cardSummaries = useMemo(() => {
    return cards.map((card) => {
      const chargeTotal = (unpaidCardChargesMap[card.id] ?? []).reduce((sum, charge) => sum + charge.amount, 0)
      const totalToPay = chargeTotal
      const dueDate = getDueDateForMonth(card, today)
      const nextDueDate = dueDate < new Date(today.getFullYear(), today.getMonth(), today.getDate(), 12, 0, 0, 0)
        ? getDueDateForMonth(card, new Date(today.getFullYear(), today.getMonth() + 1, 1))
        : dueDate

      return {
        ...card,
        chargeTotal,
        totalToPay,
        nextDueDate,
      }
    })
  }, [cards, unpaidCardChargesMap])

  const totals = useMemo(() => {
    const totalCharges = charges.reduce((sum, charge) => sum + charge.amount, 0)
    const totalChargesCount = charges.length
    const totalDebt = cardSummaries.reduce((sum, card) => sum + card.totalToPay, 0)
    const nextPendingCharge = [...unpaidChargesWithDue].sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())[0]
    const nextPayment = nextPendingCharge ? { nextDueDate: nextPendingCharge.dueDate } : null

    return {
      totalCharges,
      totalChargesCount,
      totalDebt,
      nextPayment,
    }
  }, [cardSummaries, charges, unpaidChargesWithDue])

  const selectedMonthDate = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    return new Date(year, month - 1, 1, 12, 0, 0, 0)
  }, [selectedMonth])

  const monthLabel = useMemo(() => monthFormatter.format(selectedMonthDate), [selectedMonthDate])
  const calendarDays = useMemo(() => buildCalendarMatrix(selectedMonthDate), [selectedMonthDate])

  const paymentEvents = useMemo<CalendarEvent[]>(() => {
    const selectedMonthText = toMonthInput(selectedMonthDate)
    const byDate = new Map<string, CalendarEvent>()

    unpaidChargesWithDue.forEach((entry) => {
      if (entry.dueMonthText !== selectedMonthText) {
        return
      }

      const dateText = entry.dueDateText
      const label = getCardDisplayName(entry.card)
      const amount = entry.charge.amount

      const existing = byDate.get(dateText)
      if (existing) {
        existing.total += amount
        const existingCard = existing.cards.find((cardItem) => cardItem.id === entry.card.id)
        if (existingCard) {
          existingCard.amount += amount
        } else {
          existing.cards.push({ id: entry.card.id, label, amount })
        }
        return
      }

      byDate.set(dateText, {
        dateText,
        total: amount,
        cards: [{ id: entry.card.id, label, amount }],
      })
    })

    return Array.from(byDate.values()).sort((a, b) => a.dateText.localeCompare(b.dateText))
  }, [selectedMonthDate, unpaidChargesWithDue])

  const cutoffEvents = useMemo<CalendarCutoffEvent[]>(() => {
    const year = selectedMonthDate.getFullYear()
    const monthIndex = selectedMonthDate.getMonth()
    const byDate = new Map<string, CalendarCutoffEvent>()

    cards.forEach((card) => {
      const cutoffDate = toCalendarDate(year, monthIndex, card.closingDay)
      if (cutoffDate.getMonth() !== monthIndex) {
        return
      }

      const dateText = toDateInput(cutoffDate)
      const label = getCardDisplayName(card)
      const existing = byDate.get(dateText)

      if (existing) {
        existing.cards.push({ id: card.id, label })
        return
      }

      byDate.set(dateText, {
        dateText,
        cards: [{ id: card.id, label }],
      })
    })

    return Array.from(byDate.values()).sort((a, b) => a.dateText.localeCompare(b.dateText))
  }, [cards, selectedMonthDate])

  const purchaseHistoryItems = useMemo<PurchaseHistoryItem[]>(() => {
    const groups = new Map<string, PurchaseHistoryItem>()

    ;[...charges]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((charge) => {
        const card = cards.find((item) => item.id === charge.cardId)
        const cardLabel = card ? getCardDisplayName(card) : 'Tarjeta eliminada'
        const groupKey = charge.purchaseGroupId ? `group-${charge.purchaseGroupId}` : `single-${charge.id}`
        const isGroupedInstallment = Boolean(charge.purchaseGroupId)
        const concept = isGroupedInstallment ? normalizeInstallmentConcept(charge.concept) : charge.concept

        const existing = groups.get(groupKey)
        if (!existing) {
          groups.set(groupKey, {
            id: groupKey,
            cardId: charge.cardId,
            cardLabel,
            concept,
            date: charge.date,
            amount: charge.amount,
            totalInstallments: charge.installmentTotal ?? 1,
            paidInstallments: charge.paid ? 1 : 0,
            pendingInstallments: charge.paid ? 0 : 1,
            isGroupedInstallment,
            charges: [charge],
          })
          return
        }

        existing.amount += charge.amount
        existing.paidInstallments += charge.paid ? 1 : 0
        existing.pendingInstallments += charge.paid ? 0 : 1
        existing.totalInstallments = charge.installmentTotal
          ? Math.max(existing.totalInstallments, charge.installmentTotal)
          : existing.totalInstallments + 1
        existing.charges.push(charge)

        if (charge.date > existing.date) {
          existing.date = charge.date
        }
      })

    return Array.from(groups.values()).sort((a, b) => b.date.localeCompare(a.date))
  }, [cards, charges])

  const filteredPurchaseHistoryItems = useMemo(() => {
    const searchTerm = purchaseSearch.trim().toLowerCase()
    if (!searchTerm) {
      return purchaseHistoryItems
    }

    return purchaseHistoryItems.filter((item) =>
      item.concept.toLowerCase().includes(searchTerm) ||
      item.cardLabel.toLowerCase().includes(searchTerm) ||
      item.date.includes(searchTerm),
    )
  }, [purchaseHistoryItems, purchaseSearch])

  const filteredPurchaseHistoryTotal = useMemo(() => {
    return filteredPurchaseHistoryItems.reduce((sum, item) => sum + item.amount, 0)
  }, [filteredPurchaseHistoryItems])

  const zeroRatePurchaseItems = useMemo(() => {
    return purchaseHistoryItems.filter((item) => item.isGroupedInstallment)
  }, [purchaseHistoryItems])

  const zeroRatePurchaseTotal = useMemo(() => {
    return zeroRatePurchaseItems.reduce((sum, item) => sum + item.amount, 0)
  }, [zeroRatePurchaseItems])

  const monthlyCardPayments = useMemo(() => {
    return paymentEvents
      .flatMap((event) =>
        event.cards.map((card) => ({
          id: card.id,
          label: card.label,
          amount: card.amount,
          dueDate: new Date(`${event.dateText}T12:00:00`),
        })),
      )
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  }, [paymentEvents])

  const monthlyPaymentsTotal = useMemo(() => {
    return monthlyCardPayments.reduce((sum, item) => sum + item.amount, 0)
  }, [monthlyCardPayments])

  const selectedPaymentEvent = useMemo(() => {
    if (!selectedPaymentDateText) {
      return null
    }

    return paymentEvents.find((event) => event.dateText === selectedPaymentDateText) ?? null
  }, [paymentEvents, selectedPaymentDateText])

  const selectedPaymentCards = useMemo<PaymentDayCardDetail[]>(() => {
    if (!selectedPaymentEvent) {
      return []
    }

    return selectedPaymentEvent.cards.map((eventCard) => {
      const card = cards.find((item) => item.id === eventCard.id)
      const relatedCharges = unpaidChargesWithDue
        .filter((entry) => entry.card.id === eventCard.id && entry.dueDateText === selectedPaymentEvent.dateText)
        .map((entry) => entry.charge)
        .sort((a, b) => b.date.localeCompare(a.date))
      const availableBalance = card?.balance ?? 0
      const assignedBalance = availableBalance + eventCard.amount

      return {
        id: eventCard.id,
        label: eventCard.label,
        amount: eventCard.amount,
        assignedBalance,
        availableBalance,
        netBalance: assignedBalance - eventCard.amount,
        paymentDay: card?.paymentDay ?? null,
        charges: relatedCharges,
      }
    })
  }, [cards, unpaidChargesWithDue, selectedPaymentEvent])

  const hasRelatedTransactions = (cardId: string) => {
    return (cardChargesMap[cardId]?.length ?? 0) > 0
  }

  const resetCardForm = () => {
    setEditingCardId(null)
    setCardForm(initialCardForm())
  }

  const openNewCardModal = () => {
    resetCardForm()
    setIsCardModalOpen(true)
  }

  const openEditCardModal = (card: CreditCardAccount) => {
    if (hasRelatedTransactions(card.id)) {
      window.alert('Solo puedes actualizar tarjetas sin transacciones relacionadas.')
      return
    }

    setEditingCardId(card.id)
    setCardForm({
      bankName: card.bankName,
      nickname: card.nickname,
      balance: String(card.balance),
      closingDay: String(card.closingDay),
      paymentDay: String(card.paymentDay),
    })
    setIsCardModalOpen(true)
  }

  const closeCardModal = () => {
    setIsCardModalOpen(false)
    resetCardForm()
  }

  const openChargeModal = () => {
    setChargeForm(initialChargeForm(cards))
    setIsZeroRateFlow(false)
    setIsChargeModalOpen(true)
  }

  const openZeroRateChargeModal = () => {
    const initialForm = initialChargeForm(cards)
    setChargeForm({
      ...initialForm,
      purchaseType: 'zero-rate',
      installments: initialForm.installments || '3',
    })
    setIsZeroRateFlow(true)
    setIsChargeModalOpen(true)
  }

  const openPurchasesModal = () => {
    setPurchaseSearch('')
    setIsPurchasesModalOpen(true)
  }

  const openZeroRatePurchasesModal = () => {
    setIsZeroRatePurchasesModalOpen(true)
  }

  const closeChargeModal = () => {
    setIsChargeModalOpen(false)
    setIsZeroRateFlow(false)
    setChargeForm(initialChargeForm(cards))
  }

  const closePurchasesModal = () => {
    setPurchaseSearch('')
    setIsPurchasesModalOpen(false)
  }

  const closeZeroRatePurchasesModal = () => {
    setIsZeroRatePurchasesModalOpen(false)
  }

  const openManageCardsModal = () => {
    setIsManageCardsModalOpen(true)
  }

  const closeManageCardsModal = () => {
    setIsManageCardsModalOpen(false)
  }

  const openPaymentDetailModal = (dateText: string) => {
    setSelectedPaymentDateText(dateText)
  }

  const closePaymentDetailModal = () => {
    setSelectedPaymentDateText(null)
  }

  const handleCardSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSavingCard) {
      return
    }

    const bankName = cardForm.bankName.trim()
    const nickname = cardForm.nickname.trim()
    const balance = Number(cardForm.balance)
    const closingDay = Number(cardForm.closingDay)
    const paymentDay = Number(cardForm.paymentDay)

    if (
      bankName.length === 0 ||
      !Number.isFinite(balance) ||
      !Number.isInteger(closingDay) ||
      !Number.isInteger(paymentDay) ||
      closingDay < 1 ||
      closingDay > 31 ||
      paymentDay < 1 ||
      paymentDay > 31
    ) {
      window.alert('Revisa los datos de la tarjeta. Banco, saldo y días deben ser válidos.')
      return
    }

    setIsSavingCard(true)

    try {
      if (editingCardId) {
        if (isCloudSyncEnabled && db) {
          try {
            await updateDoc(doc(db, 'cards', editingCardId), {
              bankName,
              nickname,
              balance,
              closingDay,
              paymentDay,
            })
          } catch (error) {
            console.error('Error al actualizar tarjeta en Firestore:', error)
            window.alert('No se pudo actualizar la tarjeta en Firebase.')
            return
          }
        }

        setCards((current) =>
          current.map((card) =>
            card.id === editingCardId
              ? {
                  ...card,
                  bankName,
                  nickname,
                  balance,
                  closingDay,
                  paymentDay,
                }
              : card,
          ),
        )
      } else {
        const currentUid = auth?.currentUser?.uid
        if (isCloudSyncEnabled && !currentUid) {
          window.alert('Tu sesion de Firebase no esta activa. Recarga la pagina e intenta de nuevo.')
          return
        }

        const newCard: CreditCardAccount = {
          id: generateId(),
          ownerUid: currentUid,
          bankName,
          nickname,
          balance,
          closingDay,
          paymentDay,
          createdAt: new Date().toISOString(),
        }

        if (isCloudSyncEnabled && db) {
          try {
            await setDoc(doc(db, 'cards', newCard.id), newCard)
          } catch (error) {
            console.error('Error al guardar tarjeta en Firestore:', error)
            window.alert('No se pudo guardar la tarjeta en Firebase.')
            return
          }
        }

        setCards((current) => [newCard, ...current])
        setChargeForm((current) => ({ ...current, cardId: current.cardId || newCard.id }))
      }

      closeCardModal()
    } finally {
      setIsSavingCard(false)
    }
  }

  const handleChargeSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (isSavingCharge) {
      return
    }

    const cardId = chargeForm.cardId
    const concept = chargeForm.concept.trim()
    const amount = Number(chargeForm.amount)
    const isZeroRatePurchase = isZeroRateFlow || chargeForm.purchaseType === 'zero-rate'
    const installments = isZeroRatePurchase ? Number(chargeForm.installments) : 1

    if (!cardId || concept.length === 0 || !Number.isFinite(amount) || amount <= 0 || !chargeForm.date) {
      window.alert('Completa tarjeta, concepto, monto y fecha para registrar el gasto.')
      return
    }

    if (
      isZeroRatePurchase &&
      (!Number.isInteger(installments) || installments < 2 || installments > 48)
    ) {
      window.alert('Para tasa cero, registra un número de cuotas entre 2 y 48.')
      return
    }

    const targetCard = cards.find((card) => card.id === cardId)
    if (!targetCard) {
      window.alert('Selecciona una tarjeta válida.')
      return
    }

    if (amount > targetCard.balance) {
      window.alert('El monto del gasto supera el saldo disponible de la tarjeta seleccionada.')
      return
    }

    const currentUid = auth?.currentUser?.uid
    if (isCloudSyncEnabled && !currentUid) {
      window.alert('Tu sesion de Firebase no esta activa. Recarga la pagina e intenta de nuevo.')
      return
    }

    setIsSavingCharge(true)

    try {
      const firstDueDate = getDueDateForCharge(targetCard, chargeForm.date)
      const installmentAmounts = splitAmountByInstallments(amount, installments)
      const purchaseGroupId = installments > 1 ? generateId() : undefined

      const newCharges: CardCharge[] = installmentAmounts.map((installmentAmount, index) => {
        const dueDate = getInstallmentDueDate(firstDueDate, index, targetCard.paymentDay)
        const installmentLabel = installments > 1 ? ` (Cuota ${index + 1}/${installments})` : ''

        const baseCharge: CardCharge = {
          id: generateId(),
          ownerUid: currentUid,
          cardId,
          concept: `${concept}${installmentLabel}`,
          amount: installmentAmount,
          date: chargeForm.date,
          dueDate: toDateInput(dueDate),
          paid: false,
        }

        if (installments > 1) {
          return {
            ...baseCharge,
            purchaseGroupId,
            installmentNumber: index + 1,
            installmentTotal: installments,
          }
        }

        return baseCharge
      })

      const nextBalance = Math.max(0, targetCard.balance - amount)

      if (isCloudSyncEnabled && db) {
        try {
          const firestore = db
          const batch = writeBatch(firestore)
          newCharges.forEach((charge) => {
            batch.set(doc(firestore, 'charges', charge.id), charge)
          })
          batch.update(doc(firestore, 'cards', cardId), { balance: nextBalance })
          await batch.commit()
        } catch (error) {
          console.error('Error al guardar gasto en Firestore:', error)
          window.alert('No se pudo guardar el gasto en Firebase.')
          return
        }
      }

      setCharges((current) => [...newCharges, ...current])
      setCards((current) =>
        current.map((card) =>
          card.id === cardId ? { ...card, balance: nextBalance } : card,
        ),
      )

      closeChargeModal()
    } finally {
      setIsSavingCharge(false)
    }
  }

  const handleDeleteCard = async (card: CreditCardAccount) => {
    if (hasRelatedTransactions(card.id)) {
      window.alert('No puedes eliminar una tarjeta que tiene transacciones relacionadas.')
      return
    }

    const confirmed = window.confirm(`¿Eliminar ${getCardDisplayName(card)} y sus cargos registrados?`)
    if (!confirmed) {
      return
    }

    if (isCloudSyncEnabled && db) {
      try {
        await deleteDoc(doc(db, 'cards', card.id))
      } catch (error) {
        console.error('Error al eliminar tarjeta en Firestore:', error)
        window.alert('No se pudo eliminar la tarjeta en Firebase.')
        return
      }
    }

    setCards((current) => current.filter((item) => item.id !== card.id))
    setCharges((current) => current.filter((charge) => charge.cardId !== card.id))
  }

  const handleDeleteCharge = async (charge: CardCharge) => {
    const confirmed = window.confirm(`¿Eliminar el gasto "${charge.concept}"?`)
    if (!confirmed) {
      return
    }

    const targetCard = cards.find((card) => card.id === charge.cardId)
    if (isCloudSyncEnabled && db && targetCard) {
      try {
        const batch = writeBatch(db)
        batch.delete(doc(db, 'charges', charge.id))

        if (!charge.paid) {
          batch.update(doc(db, 'cards', charge.cardId), {
            balance: Math.max(0, targetCard.balance + charge.amount),
          })
        }

        await batch.commit()
      } catch (error) {
        console.error('Error al eliminar gasto en Firestore:', error)
        window.alert('No se pudo eliminar el gasto en Firebase.')
        return
      }
    }

    setCharges((current) => current.filter((item) => item.id !== charge.id))
    setCards((current) =>
      current.map((card) =>
        card.id === charge.cardId
          ? { ...card, balance: charge.paid ? card.balance : Math.max(0, card.balance + charge.amount) }
          : card,
      ),
    )
  }

  const handleDeletePurchaseItem = async (item: PurchaseHistoryItem) => {
    if (item.charges.length === 1) {
      await handleDeleteCharge(item.charges[0])
      return
    }

    const confirmed = window.confirm(
      `¿Eliminar la compra "${item.concept}" con ${item.totalInstallments} cuotas registradas?`,
    )
    if (!confirmed) {
      return
    }

    const targetCard = cards.find((card) => card.id === item.cardId)
    const unpaidTotal = item.charges.filter((charge) => !charge.paid).reduce((sum, charge) => sum + charge.amount, 0)
    const chargeIds = new Set(item.charges.map((charge) => charge.id))

    if (isCloudSyncEnabled && db) {
      try {
        const firestore = db
        const batch = writeBatch(firestore)

        item.charges.forEach((charge) => {
          batch.delete(doc(firestore, 'charges', charge.id))
        })

        if (targetCard && unpaidTotal > 0) {
          batch.update(doc(firestore, 'cards', item.cardId), {
            balance: Math.max(0, targetCard.balance + unpaidTotal),
          })
        }

        await batch.commit()
      } catch (error) {
        console.error('Error al eliminar compra agrupada en Firestore:', error)
        window.alert('No se pudo eliminar la compra en Firebase.')
        return
      }
    }

    setCharges((current) => current.filter((charge) => !chargeIds.has(charge.id)))

    if (unpaidTotal > 0) {
      setCards((current) =>
        current.map((card) =>
          card.id === item.cardId ? { ...card, balance: Math.max(0, card.balance + unpaidTotal) } : card,
        ),
      )
    }
  }

  const handlePayCardBalance = async (cardId: string, dueDateText?: string) => {
    const targetCard = cards.find((card) => card.id === cardId)
    if (!targetCard) {
      return
    }

    const pendingCharges = charges.filter((charge) => {
      if (charge.cardId !== cardId || charge.paid) {
        return false
      }

      if (!dueDateText) {
        return true
      }

      const chargeDueDate = charge.dueDate ?? toDateInput(getDueDateForCharge(targetCard, charge.date))
      return chargeDueDate === dueDateText
    })

    const totalPending = pendingCharges.reduce((sum, charge) => sum + charge.amount, 0)
    if (totalPending <= 0) {
      return
    }

    const confirmed = window.confirm(
      `¿Registrar pago de ${money.format(totalPending)} para ${getCardDisplayName(targetCard)}?`,
    )
    if (!confirmed) {
      return
    }

    setActivePayingCardId(cardId)

    try {
      if (isCloudSyncEnabled && db) {
        try {
          const firestore = db
          const batch = writeBatch(firestore)
          batch.update(doc(firestore, 'cards', cardId), { balance: Math.max(0, targetCard.balance + totalPending) })

          pendingCharges.forEach((charge) => {
            batch.update(doc(firestore, 'charges', charge.id), { paid: true })
          })

          await batch.commit()
        } catch (error) {
          console.error('Error al registrar pago en Firestore:', error)
          window.alert('No se pudo registrar el pago en Firebase.')
          return
        }
      }

      const pendingIds = new Set(pendingCharges.map((charge) => charge.id))
      setCards((current) =>
        current.map((card) =>
          card.id === cardId ? { ...card, balance: Math.max(0, card.balance + totalPending) } : card,
        ),
      )
      setCharges((current) =>
        current.map((charge) =>
          pendingIds.has(charge.id)
            ? {
                ...charge,
                paid: true,
              }
            : charge,
        ),
      )
    } finally {
      setActivePayingCardId(null)
    }
  }

  const handleLogout = async () => {
    if (!auth || isLoggingOut) {
      return
    }

    setIsSessionMenuOpen(false)

    const confirmed = window.confirm('¿Cerrar sesión de Firebase en este dispositivo?')
    if (!confirmed) {
      return
    }

    setIsLoggingOut(true)

    try {
      await signOut(auth)
      setIsCloudSyncEnabled(false)
      setCards([])
      setCharges([])
      setSelectedPaymentDateText(null)
      setIsCardModalOpen(false)
      setIsChargeModalOpen(false)
      setIsPurchasesModalOpen(false)
      setIsZeroRatePurchasesModalOpen(false)
      setIsManageCardsModalOpen(false)
      setPurchaseSearch('')
      window.localStorage.removeItem(STORAGE_KEYS.cards)
      window.localStorage.removeItem(STORAGE_KEYS.charges)
      window.alert('Sesión cerrada correctamente.')
    } catch (error) {
      console.error('No se pudo cerrar sesión en Firebase:', error)
      window.alert('No se pudo cerrar sesión. Intenta nuevamente.')
    } finally {
      setIsLoggingOut(false)
    }
  }

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!auth || isLoggingIn) {
      return
    }

    const email = loginEmail.trim()
    const password = loginPassword

    if (!email || !password) {
      setLoginError('Ingresa correo y contraseña para continuar.')
      return
    }

    setIsLoggingIn(true)
    setLoginError(null)

    try {
      await signInWithEmailAndPassword(auth, email, password)
    } catch (error) {
      const code = getFirebaseErrorCode(error)
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password' || code === 'auth/user-not-found') {
        setLoginError('Credenciales inválidas. Verifica correo y contraseña.')
      } else {
        setLoginError('No se pudo iniciar sesión. Intenta nuevamente.')
      }
    } finally {
      setIsLoggingIn(false)
    }
  }

  const shiftMonth = (delta: number) => {
    const nextMonth = new Date(selectedMonthDate)
    nextMonth.setMonth(nextMonth.getMonth() + delta)
    setSelectedMonth(toMonthInput(nextMonth))
  }

  const isDarkTheme = themeMode === 'dark'
  const zeroRateInstallments = Number(chargeForm.installments)
  const zeroRateAmount = Number(chargeForm.amount)
  const zeroRateInstallmentAmount =
    chargeForm.purchaseType === 'zero-rate' &&
    Number.isFinite(zeroRateAmount) &&
    zeroRateAmount > 0 &&
    Number.isInteger(zeroRateInstallments) &&
    zeroRateInstallments > 0
      ? zeroRateAmount / zeroRateInstallments
      : 0

  const toggleThemeMode = () => {
    setThemeMode((current) => (current === 'light' ? 'dark' : 'light'))
  }

  if (!isAuthChecked) {
    return (
      <div className="app-shell auth-shell">
        <main className="auth-card">
          <p className="eyebrow">MiroMoney</p>
          <h1>Validando sesión...</h1>
          <p className="hero-copy">Estamos comprobando tu acceso para cargar tu información.</p>
        </main>
      </div>
    )
  }

  if (!isUserAuthenticated) {
    return (
      <div className="app-shell auth-shell">
        <main className="auth-card">
          <p className="eyebrow">MiroMoney</p>
          <h1>Iniciar sesión</h1>
          <p className="hero-copy">Accede con tu cuenta para continuar con tus tarjetas y compras.</p>

          <form className="form-grid auth-form" onSubmit={handleLoginSubmit}>
            <label className="field">
              <span>Correo</span>
              <input
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(event) => setLoginEmail(event.target.value)}
                placeholder="correo@dominio.com"
                required
              />
            </label>

            <label className="field">
              <span>Contraseña</span>
              <input
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(event) => setLoginPassword(event.target.value)}
                placeholder="••••••••"
                required
              />
            </label>

            {loginError ? <p className="auth-error">{loginError}</p> : null}

            <div className="form-actions auth-actions">
              <button type="submit" className="primary-button" disabled={isLoggingIn}>
                {isLoggingIn ? 'Ingresando...' : 'Entrar'}
              </button>
            </div>
          </form>
        </main>
      </div>
    )
  }

  return (
    <div className="app-shell">
      <main className="dashboard-shell">
        <section className="hero-panel">
          <div className="hero-content">
            <p className="eyebrow">Gestión de tarjetas</p>
            <h1>MiroMoney Cards</h1>
            <p className="hero-copy">
              Controla tus tarjetas de crédito, registra cada compra o gasto, y visualiza
              tus pagos próximos en un calendario claro.
            </p>
          </div>

          <div className="hero-actions">
            <div className="hero-primary-actions">
              <button
                type="button"
                className="ghost-button"
                onClick={openPurchasesModal}
              >
                <Banknote size={16} />
                Compras
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={openManageCardsModal}
                aria-label="Configurar tarjetas"
                title="Configurar tarjetas"
              >
                <Settings2 size={16} />
                Tarjetas
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={openZeroRatePurchasesModal}
                aria-label="Registrar compra a tasa cero"
                title="Registrar compra a tasa cero"
              >
                <Wallet size={16} />
                Tasa cero
              </button>
              <button
                type="button"
                className="ghost-button theme-toggle-button"
                onClick={toggleThemeMode}
                aria-label={isDarkTheme ? 'Activar tema de día' : 'Activar tema de noche'}
                title={isDarkTheme ? 'Cambiar a modo día' : 'Cambiar a modo noche'}
              >
                {isDarkTheme ? <Sun size={16} /> : <Moon size={16} />}
              </button>
            </div>
            {isUserAuthenticated ? (
              <div className="session-controls">
                <div className="session-chip" aria-live="polite">
                  <div className="session-chip-meta">
                    <span className="session-chip-label">Sesión activa</span>
                    <strong className="session-chip-user" title={currentUserLabel || 'Usuario autenticado'}>
                      {currentUserLabel || 'Usuario autenticado'}
                    </strong>
                  </div>
                </div>
                <div className="session-menu-wrap" ref={sessionMenuRef}>
                  <button
                    type="button"
                    className="icon-pill-button session-menu-trigger"
                    onClick={() => setIsSessionMenuOpen((current) => !current)}
                    aria-haspopup="menu"
                    aria-expanded={isSessionMenuOpen}
                    aria-label="Opciones de sesión"
                  >
                    <User size={16} />
                  </button>

                  {isSessionMenuOpen ? (
                    <div className="session-menu-panel" role="menu" aria-label="Menú de sesión">
                      <button
                        type="button"
                        className="ghost-button logout-button session-menu-item"
                        onClick={() => {
                          void handleLogout()
                        }}
                        disabled={isLoggingOut}
                      >
                        <LogOut size={16} />
                        {isLoggingOut ? 'Cerrando...' : 'Cerrar sesión'}
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="session-chip offline" aria-live="polite">
                <div className="session-chip-meta">
                  <span className="session-chip-label">Sesión</span>
                  <strong className="session-chip-user">Sin sesión activa</strong>
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="stats-grid">
          <article className="stat-card emerald">
            <span><CreditCard size={14} /> Tarjetas activas</span>
            <strong>{cards.length}</strong>
          </article>
          <article className="stat-card amber">
            <span><Wallet size={14} /> Total por pagar</span>
            <strong>{money.format(totals.totalDebt)}</strong>
          </article>
          <article className="stat-card coral">
            <span><Banknote size={14} /> Cargos registrados</span>
            <strong>{totals.totalChargesCount}</strong>
          </article>
          <article className="stat-card slate">
            <span><CalendarDays size={14} /> Próximo vencimiento</span>
            <strong>{totals.nextPayment ? formatDueLabel(totals.nextPayment.nextDueDate) : 'Sin tarjetas'}</strong>
          </article>
        </section>

        <section className="workspace-grid">
          <div className="workspace-main">
            <section className="panel sticky-panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Calendario</p>
                  <h2>Fechas de pago</h2>
                </div>
              </div>

              <div className="calendar-toolbar">
                <button type="button" className="ghost-button compact" onClick={() => shiftMonth(-1)}>
                  Anterior
                </button>
                <strong>{monthLabel}</strong>
                <button type="button" className="ghost-button compact" onClick={() => shiftMonth(1)}>
                  Siguiente
                </button>
              </div>

              <div className="calendar-grid">
                {weekdayLabels.map((weekday) => (
                  <span key={weekday} className="calendar-weekday">
                    {weekday}
                  </span>
                ))}

                {calendarDays.map((day, index) => {
                  if (!day) {
                    return <div key={`empty-${index}`} className="calendar-cell empty" />
                  }

                  const dateText = toDateInput(day)
                  const eventsForDay = paymentEvents.find((event) => event.dateText === dateText)
                  const cutoffForDay = cutoffEvents.find((event) => event.dateText === dateText)
                  const isToday = dateText === toDateInput(today)

                  return (
                    <div key={dateText} className={`calendar-cell${isToday ? ' today' : ''}`}>
                      <div className="calendar-day-head">
                        <span className={`calendar-day-number${isToday ? ' today' : ''}`}>{day.getDate()}</span>
                      </div>
                      {cutoffForDay ? (
                        <div
                          className="calendar-cutoff"
                          title={cutoffForDay.cards.map((card) => card.label).join(', ')}
                        >
                          <strong>Corte</strong>
                          <small>{cutoffForDay.cards.length} tarjeta{cutoffForDay.cards.length === 1 ? '' : 's'}</small>
                        </div>
                      ) : null}
                      {eventsForDay ? (
                        <button
                          type="button"
                          className="calendar-event calendar-event-button"
                          onClick={() => openPaymentDetailModal(eventsForDay.dateText)}
                        >
                          <strong>{money.format(eventsForDay.total)}</strong>
                          <small>{eventsForDay.cards.length} pago{eventsForDay.cards.length === 1 ? '' : 's'}</small>
                        </button>
                      ) : null}
                    </div>
                  )
                })}
              </div>
            </section>
          </div>

          <aside className="workspace-side">
            <section className="panel">
              <div className="section-head">
                <div>
                  <p className="eyebrow">Resumen de gastos</p>
                  <h2>Gastos por tarjeta</h2>
                </div>
                <span className="section-badge">{money.format(monthlyPaymentsTotal)}</span>
              </div>

              {monthlyCardPayments.length === 0 ? (
                <div className="empty-state compact">
                  <CalendarDays size={28} />
                  <p>No hay gastos registrados para mostrar en este resumen.</p>
                </div>
              ) : (
                <div className="monthly-payments-list">
                  {monthlyCardPayments.map((payment) => (
                    <button
                      type="button"
                      className="monthly-payment-item interactive"
                      key={payment.id}
                      onClick={() => openPaymentDetailModal(toDateInput(payment.dueDate))}
                    >
                      <div>
                        <p className="movement-meta">{payment.label}</p>
                        <h3>{money.format(payment.amount)}</h3>
                        <span>Vence: {toDateInput(payment.dueDate)}</span>
                      </div>
                      <div className="charge-right">
                        <strong>Día {payment.dueDate.getDate()}</strong>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>
      </main>

      {selectedPaymentEvent ? (
        <div className="modal-backdrop" role="presentation" onClick={closePaymentDetailModal}>
          <section className="modal-card modal-detail" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Pagos del calendario</p>
                <h2>Detalle de pago · {formatLongDate(selectedPaymentEvent.dateText)}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closePaymentDetailModal} aria-label="Cerrar detalle de pago">
                <X size={16} />
              </button>
            </div>

            <div className="detail-grid">
              <article className="detail-card highlight">
                <span>Total pendiente del día</span>
                <strong>{money.format(selectedPaymentEvent.total)}</strong>
              </article>
              <article className="detail-card">
                <span>Tarjetas con vencimiento</span>
                <strong>{selectedPaymentEvent.cards.length}</strong>
              </article>
              <article className="detail-card">
                <span>Compras relacionadas</span>
                <strong>{selectedPaymentCards.reduce((sum, card) => sum + card.charges.length, 0)}</strong>
              </article>
            </div>

            <div className="payment-detail-list">
              {selectedPaymentCards.map((paymentCard) => (
                <article key={paymentCard.id} className="payment-detail-card">
                  <div className="detail-section-head">
                    <div>
                      <p className="movement-meta">{paymentCard.label}</p>
                      <h3>{money.format(paymentCard.amount)}</h3>
                    </div>
                    <div className="detail-actions">
                      <span className="section-badge">
                        {paymentCard.paymentDay ? `Día ${paymentCard.paymentDay}` : 'Sin día'}
                      </span>
                      <button
                        type="button"
                        className="primary-button"
                        onClick={() => {
                          void handlePayCardBalance(paymentCard.id, selectedPaymentEvent.dateText)
                        }}
                        disabled={paymentCard.amount <= 0 || activePayingCardId === paymentCard.id}
                      >
                        {activePayingCardId === paymentCard.id ? 'Pagando...' : 'Pagar tarjeta'}
                      </button>
                    </div>
                  </div>

                  <div className="payment-balance-row">
                    <article>
                      <span>Saldo asignado</span>
                      <strong>{money.format(paymentCard.assignedBalance)}</strong>
                    </article>
                    <article>
                      <span>Deuda pendiente</span>
                      <strong>{money.format(paymentCard.amount)}</strong>
                    </article>
                    <article>
                      <span>Saldo - deuda</span>
                      <strong>{money.format(paymentCard.netBalance)}</strong>
                    </article>
                  </div>

                  {paymentCard.charges.length === 0 ? (
                    <div className="empty-state compact">
                      <p>Sin compras registradas para esta tarjeta.</p>
                    </div>
                  ) : (
                    <div className="table-wrap">
                      <table className="cards-table" aria-label="Detalle de compras por tarjeta">
                        <thead>
                          <tr>
                            <th>Concepto</th>
                            <th>Fecha</th>
                            <th>Monto</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paymentCard.charges.map((charge) => (
                            <tr key={charge.id}>
                              <td>{charge.concept}</td>
                              <td>{charge.date}</td>
                              <td>{money.format(charge.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </article>
              ))}
            </div>
          </section>
        </div>
      ) : null}

      {isCardModalOpen ? (
        <div
          className={`modal-backdrop${isManageCardsModalOpen ? ' modal-backdrop-top-layer' : ''}`}
          role="presentation"
        >
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Tarjetas</p>
                <h2>{editingCardId ? 'Editar tarjeta' : 'Registrar tarjeta'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeCardModal} aria-label="Cerrar modal">
                <X size={16} />
              </button>
            </div>

            <form className="form-grid modal-form card-form" onSubmit={handleCardSubmit}>
              <label className="field">
                <span>Nombre del banco</span>
                <input
                  value={cardForm.bankName}
                  onChange={(event) => setCardForm((current) => ({ ...current, bankName: event.target.value }))}
                  placeholder="Ej. Bancolombia"
                  required
                />
              </label>

              <label className="field">
                <span>Alias de la tarjeta</span>
                <input
                  value={cardForm.nickname}
                  onChange={(event) => setCardForm((current) => ({ ...current, nickname: event.target.value }))}
                  placeholder="Ej. Visa Platinum"
                />
              </label>

              <label className="field">
                <span>Saldo disponible</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={cardForm.balance}
                  onChange={(event) => setCardForm((current) => ({ ...current, balance: event.target.value }))}
                  placeholder="0"
                  required
                />
              </label>

              <label className="field">
                <span>Fecha de corte</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={cardForm.closingDay}
                  onChange={(event) => setCardForm((current) => ({ ...current, closingDay: event.target.value }))}
                  placeholder="Ej. 25"
                  required
                />
              </label>

              <label className="field">
                <span>Fecha de pago</span>
                <input
                  type="number"
                  min="1"
                  max="31"
                  value={cardForm.paymentDay}
                  onChange={(event) => setCardForm((current) => ({ ...current, paymentDay: event.target.value }))}
                  placeholder="Ej. 5"
                  required
                />
              </label>

              <div className="form-actions modal-actions">
                {editingCardId ? (
                  <button type="button" className="ghost-button" onClick={resetCardForm}>
                    Cancelar edición
                  </button>
                ) : null}
                <button type="submit" className="primary-button" disabled={isSavingCard}>
                  {isSavingCard ? 'Guardando...' : editingCardId ? 'Guardar cambios' : 'Guardar tarjeta'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isChargeModalOpen ? (
        <div
          className={`modal-backdrop${isPurchasesModalOpen || isZeroRatePurchasesModalOpen ? ' modal-backdrop-top-layer' : ''}`}
          role="presentation"
        >
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Movimientos</p>
                <h2>{isZeroRateFlow ? 'Registrar compra a tasa cero' : 'Registrar compra o gasto'}</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeChargeModal} aria-label="Cerrar modal">
                <X size={16} />
              </button>
            </div>

            <form className="form-grid modal-form charge-form" onSubmit={handleChargeSubmit}>
              <label className="field wide">
                <span>Tarjeta</span>
                <select
                  value={chargeForm.cardId}
                  onChange={(event) => setChargeForm((current) => ({ ...current, cardId: event.target.value }))}
                  required
                  disabled={cards.length === 0}
                >
                  {cards.length === 0 ? <option value="">Primero registra una tarjeta</option> : null}
                  {cards.map((card) => (
                    <option key={card.id} value={card.id}>
                      {getCardDisplayName(card)}
                    </option>
                  ))}
                </select>
              </label>

              <label className="field wide">
                <span>{isZeroRateFlow ? 'Título' : 'Concepto'}</span>
                <input
                  value={chargeForm.concept}
                  onChange={(event) => setChargeForm((current) => ({ ...current, concept: event.target.value }))}
                  placeholder="Ej. Supermercado, gasolina, Amazon"
                  required
                />
              </label>

              {isZeroRateFlow ? (
                <label className="field">
                  <span>Cantidad de cuotas</span>
                  <input
                    type="number"
                    min="2"
                    max="48"
                    step="1"
                    value={chargeForm.installments}
                    onChange={(event) => setChargeForm((current) => ({ ...current, installments: event.target.value }))}
                    placeholder="Ej. 12"
                    required
                  />
                </label>
              ) : null}

              {isZeroRateFlow ? (
                <label className="field">
                  <span>Cuota</span>
                  <input
                    type="text"
                    value={zeroRateInstallmentAmount > 0 ? money.format(zeroRateInstallmentAmount) : ''}
                    placeholder="$0,00"
                    readOnly
                  />
                </label>
              ) : null}

              <label className="field">
                <span>Monto</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={chargeForm.amount}
                  onChange={(event) => setChargeForm((current) => ({ ...current, amount: event.target.value }))}
                  placeholder="0"
                  required
                />
              </label>

              <label className="field">
                <span>Fecha del gasto</span>
                <input
                  type="date"
                  value={chargeForm.date}
                  onChange={(event) => setChargeForm((current) => ({ ...current, date: event.target.value }))}
                  required
                />
              </label>

              <div className="form-actions modal-actions">
                <button type="submit" className="primary-button" disabled={isSavingCharge}>
                  {isSavingCharge ? 'Guardando...' : isZeroRateFlow ? 'Guardar tasa cero' : 'Guardar gasto'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isManageCardsModalOpen ? (
        <div
          className={`modal-backdrop${isCardModalOpen ? ' modal-backdrop-underlay' : ''}`}
          role="presentation"
        >
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Configuración</p>
                <h2>Gestionar tarjetas</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeManageCardsModal} aria-label="Cerrar configuración">
                <X size={16} />
              </button>
            </div>

            {cardSummaries.length === 0 ? (
              <div className="empty-state compact">
                <CreditCard size={28} />
                <p>No hay tarjetas registradas.</p>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    openNewCardModal()
                  }}
                >
                  <Plus size={16} />
                  Nueva tarjeta
                </button>
              </div>
            ) : (
              <div className="manage-cards-table-wrap">
                <div className="manage-modal-actions">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => {
                      openNewCardModal()
                    }}
                  >
                    <Plus size={16} />
                    Nueva tarjeta
                  </button>
                </div>

                <div className="table-wrap">
                  <table className="cards-table" aria-label="Listado de tarjetas">
                    <thead>
                      <tr>
                        <th>Tarjeta</th>
                        <th>Disponible</th>
                        <th>Corte</th>
                        <th>Pago</th>
                        <th>Estado</th>
                        <th>Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cardSummaries.map((card) => {
                        const totalTransactions = cardChargesMap[card.id]?.length ?? 0
                        const isLocked = totalTransactions > 0

                        return (
                          <tr key={card.id}>
                            <td>{getCardDisplayName(card)}</td>
                            <td>{money.format(card.balance)}</td>
                            <td>Día {card.closingDay}</td>
                            <td>Día {card.paymentDay}</td>
                            <td>
                              {isLocked
                                ? `${totalTransactions} transacción(es)`
                                : 'Sin transacciones'}
                            </td>
                            <td>
                              <div className="table-actions">
                                <button
                                  type="button"
                                  className="icon-button"
                                  onClick={() => {
                                    openEditCardModal(card)
                                  }}
                                  disabled={isLocked}
                                  aria-label="Actualizar tarjeta"
                                  title={isLocked ? 'No disponible: la tarjeta tiene transacciones.' : 'Actualizar tarjeta'}
                                >
                                  <Pencil size={16} />
                                </button>
                                <button
                                  type="button"
                                  className="icon-button danger"
                                  onClick={() => handleDeleteCard(card)}
                                  disabled={isLocked}
                                  aria-label="Eliminar tarjeta"
                                  title={isLocked ? 'No disponible: la tarjeta tiene transacciones.' : 'Eliminar tarjeta'}
                                >
                                  <Trash2 size={16} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <p className="manage-cards-note">
              Solo puedes actualizar o eliminar tarjetas que no tengan transacciones relacionadas.
            </p>

          </section>
        </div>
      ) : null}

      {isPurchasesModalOpen ? (
        <div
          className={`modal-backdrop${isChargeModalOpen ? ' modal-backdrop-underlay' : ''}`}
          role="presentation"
        >
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Compras</p>
                <h2>Gestionar compras</h2>
              </div>
              <button type="button" className="icon-button" onClick={closePurchasesModal} aria-label="Cerrar compras">
                <X size={16} />
              </button>
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Historial</p>
                <h3>Compras registradas</h3>
              </div>
              <div className="detail-actions">
                <span className="section-badge">{filteredPurchaseHistoryItems.length} de {purchaseHistoryItems.length}</span>
                <span className="section-badge">{money.format(filteredPurchaseHistoryTotal)}</span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    openChargeModal()
                  }}
                >
                  <Plus size={16} />
                  Nuevo gasto
                </button>
              </div>
            </div>

            <div className="quick-search-row">
              <input
                className="quick-search-input"
                value={purchaseSearch}
                onChange={(event) => setPurchaseSearch(event.target.value)}
                placeholder="Buscar por concepto, tarjeta o fecha"
              />
            </div>

            {filteredPurchaseHistoryItems.length === 0 ? (
              <div className="empty-state compact">
                <Banknote size={28} />
                <p>{purchaseSearch.trim().length > 0 ? 'No hay compras que coincidan con la búsqueda.' : 'No hay compras registradas.'}</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="cards-table" aria-label="Listado de compras">
                  <thead>
                    <tr>
                      <th>Tarjeta</th>
                      <th>Concepto</th>
                      <th>Fecha</th>
                      <th>Monto</th>
                      <th>Cuotas</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredPurchaseHistoryItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.cardLabel}</td>
                        <td>{item.concept}</td>
                        <td>{item.date}</td>
                        <td>{money.format(item.amount)}</td>
                        <td>{item.paidInstallments}/{item.totalInstallments}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="icon-button danger"
                              onClick={() => {
                                void handleDeletePurchaseItem(item)
                              }}
                              aria-label="Eliminar gasto"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}

      {isZeroRatePurchasesModalOpen ? (
        <div
          className={`modal-backdrop${isChargeModalOpen ? ' modal-backdrop-underlay' : ''}`}
          role="presentation"
        >
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Tasa cero</p>
                <h2>Gestionar compras a tasa cero</h2>
              </div>
              <button type="button" className="icon-button" onClick={closeZeroRatePurchasesModal} aria-label="Cerrar tasa cero">
                <X size={16} />
              </button>
            </div>

            <div className="section-head">
              <div>
                <p className="eyebrow">Historial</p>
                <h3>Compras financiadas</h3>
              </div>
              <div className="detail-actions">
                <span className="section-badge">{zeroRatePurchaseItems.length}</span>
                <span className="section-badge">{money.format(zeroRatePurchaseTotal)}</span>
                <button
                  type="button"
                  className="primary-button"
                  onClick={() => {
                    openZeroRateChargeModal()
                  }}
                >
                  <Plus size={16} />
                  Agregar tasa cero
                </button>
              </div>
            </div>

            {zeroRatePurchaseItems.length === 0 ? (
              <div className="empty-state compact">
                <Wallet size={28} />
                <p>No hay compras a tasa cero registradas.</p>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="cards-table" aria-label="Listado de compras a tasa cero">
                  <thead>
                    <tr>
                      <th>Tarjeta</th>
                      <th>Título</th>
                      <th>Fecha</th>
                      <th>Precio</th>
                      <th>Cuotas</th>
                      <th>Cuota</th>
                      <th>Progreso</th>
                      <th>Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {zeroRatePurchaseItems.map((item) => (
                      <tr key={item.id}>
                        <td>{item.cardLabel}</td>
                        <td>{item.concept}</td>
                        <td>{item.date}</td>
                        <td>{money.format(item.amount)}</td>
                        <td>{item.totalInstallments}</td>
                        <td>{money.format(item.amount / item.totalInstallments)}</td>
                        <td>{item.paidInstallments}/{item.totalInstallments}</td>
                        <td>
                          <div className="table-actions">
                            <button
                              type="button"
                              className="icon-button danger"
                              onClick={() => {
                                void handleDeletePurchaseItem(item)
                              }}
                              aria-label="Eliminar compra tasa cero"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App