import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import './App.css'
import {
  ArrowLeftRight,
  Banknote,
  CalendarDays,
  CreditCard,
  Pencil,
  Plus,
  Settings2,
  Trash2,
  X,
  Wallet,
} from 'lucide-react'

type CreditCardAccount = {
  id: string
  bankName: string
  nickname: string
  balance: number
  closingDay: number
  paymentDay: number
  createdAt: string
}

type CardCharge = {
  id: string
  cardId: string
  concept: string
  amount: number
  date: string
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
}

type CalendarEvent = {
  dateText: string
  total: number
  cards: Array<{ id: string; label: string; amount: number }>
}

const today = new Date()

const STORAGE_KEYS = {
  cards: 'miromoney.credit-cards',
  charges: 'miromoney.credit-charges',
  month: 'miromoney.calendar-month',
} as const

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'COP',
  maximumFractionDigits: 0,
})

const monthFormatter = new Intl.DateTimeFormat('es-CO', {
  month: 'long',
  year: 'numeric',
})

const weekdayLabels = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

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
})

const loadCards = (): CreditCardAccount[] => {
  const saved = parseSavedArray<CreditCardAccount>(window.localStorage.getItem(STORAGE_KEYS.cards))

  return saved
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.bankName === 'string' &&
        typeof item.nickname === 'string' &&
        typeof item.balance === 'number' &&
        Number.isFinite(item.balance) &&
        Number.isInteger(item.closingDay) &&
        Number.isInteger(item.paymentDay) &&
        typeof item.createdAt === 'string',
    )
    .map((item) => ({
      ...item,
      closingDay: Math.min(31, Math.max(1, item.closingDay)),
      paymentDay: Math.min(31, Math.max(1, item.paymentDay)),
    }))
}

const loadCharges = (): CardCharge[] => {
  const saved = parseSavedArray<CardCharge>(window.localStorage.getItem(STORAGE_KEYS.charges))

  return saved
    .filter(
      (item) =>
        typeof item.id === 'string' &&
        typeof item.cardId === 'string' &&
        typeof item.concept === 'string' &&
        typeof item.amount === 'number' &&
        Number.isFinite(item.amount) &&
        typeof item.date === 'string',
    )
    .sort((a, b) => b.date.localeCompare(a.date))
}

const getCardDisplayName = (card: CreditCardAccount) =>
  card.nickname.trim().length > 0 ? `${card.bankName} · ${card.nickname}` : card.bankName

const getDueDateForMonth = (card: CreditCardAccount, monthDate: Date) =>
  toCalendarDate(monthDate.getFullYear(), monthDate.getMonth(), card.paymentDay)

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
  const [editingCardId, setEditingCardId] = useState<string | null>(null)
  const [isCardModalOpen, setIsCardModalOpen] = useState(false)
  const [isChargeModalOpen, setIsChargeModalOpen] = useState(false)
  const [isPurchasesModalOpen, setIsPurchasesModalOpen] = useState(false)
  const [isManageCardsModalOpen, setIsManageCardsModalOpen] = useState(false)
  const [cardForm, setCardForm] = useState<CardFormState>(() => initialCardForm())
  const [chargeForm, setChargeForm] = useState<ChargeFormState>(() => initialChargeForm(loadCards()))
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const saved = window.localStorage.getItem(STORAGE_KEYS.month)
    return saved && /^\d{4}-\d{2}$/.test(saved) ? saved : toMonthInput(today)
  })

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

  const cardSummaries = useMemo(() => {
    return cards.map((card) => {
      const chargeTotal = (cardChargesMap[card.id] ?? []).reduce((sum, charge) => sum + charge.amount, 0)
      const totalToPay = card.balance
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
  }, [cards, cardChargesMap])

  const totals = useMemo(() => {
    const totalCharges = charges.reduce((sum, charge) => sum + charge.amount, 0)
    const totalDebt = cardSummaries.reduce((sum, card) => sum + card.balance, 0)
    const nextPayment = [...cardSummaries].sort((a, b) => a.nextDueDate.getTime() - b.nextDueDate.getTime())[0]

    return {
      totalCharges,
      totalDebt,
      nextPayment,
    }
  }, [cardSummaries, charges])

  const selectedMonthDate = useMemo(() => {
    const [year, month] = selectedMonth.split('-').map(Number)
    return new Date(year, month - 1, 1, 12, 0, 0, 0)
  }, [selectedMonth])

  const monthLabel = useMemo(() => monthFormatter.format(selectedMonthDate), [selectedMonthDate])
  const calendarDays = useMemo(() => buildCalendarMatrix(selectedMonthDate), [selectedMonthDate])

  const paymentEvents = useMemo<CalendarEvent[]>(() => {
    const year = selectedMonthDate.getFullYear()
    const monthIndex = selectedMonthDate.getMonth()
    const byDate = new Map<string, CalendarEvent>()

    cards.forEach((card) => {
      const dueDate = toCalendarDate(year, monthIndex, card.paymentDay)
      if (dueDate.getMonth() !== monthIndex) {
        return
      }

      const dateText = toDateInput(dueDate)
      const total = cardSummaries.find((item) => item.id === card.id)?.balance ?? card.balance
      const label = getCardDisplayName(card)

      const existing = byDate.get(dateText)
      if (existing) {
        existing.total += total
        existing.cards.push({ id: card.id, label, amount: total })
        return
      }

      byDate.set(dateText, {
        dateText,
        total,
        cards: [{ id: card.id, label, amount: total }],
      })
    })

    return Array.from(byDate.values()).sort((a, b) => a.dateText.localeCompare(b.dateText))
  }, [cardSummaries, cards, selectedMonthDate])

  const recentCharges = useMemo(() => {
    return [...charges]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((charge) => {
        const card = cards.find((item) => item.id === charge.cardId)

        return {
          ...charge,
          cardLabel: card ? getCardDisplayName(card) : 'Tarjeta eliminada',
        }
      })
  }, [cards, charges])

  const monthlyCardPayments = useMemo(() => {
    const year = selectedMonthDate.getFullYear()
    const monthIndex = selectedMonthDate.getMonth()

    return cardSummaries
      .map((card) => ({
        id: card.id,
        label: getCardDisplayName(card),
        amount: card.balance,
        dueDate: toCalendarDate(year, monthIndex, card.paymentDay),
      }))
      .sort((a, b) => a.dueDate.getTime() - b.dueDate.getTime())
  }, [cardSummaries, selectedMonthDate])

  const monthlyPaymentsTotal = useMemo(() => {
    return monthlyCardPayments.reduce((sum, item) => sum + item.amount, 0)
  }, [monthlyCardPayments])

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
    setIsChargeModalOpen(true)
  }

  const openPurchasesModal = () => {
    setIsPurchasesModalOpen(true)
  }

  const closeChargeModal = () => {
    setIsChargeModalOpen(false)
    setChargeForm(initialChargeForm(cards))
  }

  const closePurchasesModal = () => {
    setIsPurchasesModalOpen(false)
  }

  const openManageCardsModal = () => {
    setIsManageCardsModalOpen(true)
  }

  const closeManageCardsModal = () => {
    setIsManageCardsModalOpen(false)
  }

  const handleCardSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

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

    if (editingCardId) {
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
      const newCard: CreditCardAccount = {
        id: generateId(),
        bankName,
        nickname,
        balance,
        closingDay,
        paymentDay,
        createdAt: new Date().toISOString(),
      }

      setCards((current) => [newCard, ...current])
      setChargeForm((current) => ({ ...current, cardId: current.cardId || newCard.id }))
    }

    closeCardModal()
  }

  const handleChargeSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const cardId = chargeForm.cardId
    const concept = chargeForm.concept.trim()
    const amount = Number(chargeForm.amount)

    if (!cardId || concept.length === 0 || !Number.isFinite(amount) || amount <= 0 || !chargeForm.date) {
      window.alert('Completa tarjeta, concepto, monto y fecha para registrar el gasto.')
      return
    }

    const targetCard = cards.find((card) => card.id === cardId)
    if (!targetCard) {
      window.alert('Selecciona una tarjeta válida.')
      return
    }

    const newCharge: CardCharge = {
      id: generateId(),
      cardId,
      concept,
      amount,
      date: chargeForm.date,
    }

    setCharges((current) => [newCharge, ...current])
    setCards((current) =>
      current.map((card) =>
        card.id === cardId ? { ...card, balance: Math.max(0, card.balance + amount) } : card,
      ),
    )

    closeChargeModal()
  }

  const handleDeleteCard = (card: CreditCardAccount) => {
    if (hasRelatedTransactions(card.id)) {
      window.alert('No puedes eliminar una tarjeta que tiene transacciones relacionadas.')
      return
    }

    const confirmed = window.confirm(`¿Eliminar ${getCardDisplayName(card)} y sus cargos registrados?`)
    if (!confirmed) {
      return
    }

    setCards((current) => current.filter((item) => item.id !== card.id))
    setCharges((current) => current.filter((charge) => charge.cardId !== card.id))
  }

  const handleDeleteCharge = (charge: CardCharge) => {
    const confirmed = window.confirm(`¿Eliminar el gasto "${charge.concept}"?`)
    if (!confirmed) {
      return
    }

    setCharges((current) => current.filter((item) => item.id !== charge.id))
    setCards((current) =>
      current.map((card) =>
        card.id === charge.cardId ? { ...card, balance: Math.max(0, card.balance - charge.amount) } : card,
      ),
    )
  }

  const shiftMonth = (delta: number) => {
    const nextMonth = new Date(selectedMonthDate)
    nextMonth.setMonth(nextMonth.getMonth() + delta)
    setSelectedMonth(toMonthInput(nextMonth))
  }

  return (
    <div className="app-shell">
      <main className="dashboard-shell">
        <section className="hero-panel">
          <div>
            <p className="eyebrow">Gestión de tarjetas</p>
            <h1>MiroMoney Cards</h1>
            <p className="hero-copy">
              Controla tus tarjetas de crédito, registra cada compra o gasto, y visualiza
              tus pagos próximos en un calendario claro.
            </p>
          </div>

          <div className="hero-actions">
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
            <strong>{money.format(totals.totalCharges)}</strong>
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
                  const isToday = dateText === toDateInput(today)

                  return (
                    <div key={dateText} className={`calendar-cell${isToday ? ' today' : ''}`}>
                      <span className="calendar-day-number">{day.getDate()}</span>
                      {eventsForDay ? (
                        <div className="calendar-event">
                          <strong>{money.format(eventsForDay.total)}</strong>
                          <small>{eventsForDay.cards.length} pago{eventsForDay.cards.length === 1 ? '' : 's'}</small>
                        </div>
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
                  <p className="eyebrow">Pagos del mes</p>
                  <h2>Pagos por tarjeta</h2>
                </div>
                <span className="section-badge">{money.format(monthlyPaymentsTotal)}</span>
              </div>

              {monthlyCardPayments.length === 0 ? (
                <div className="empty-state compact">
                  <CalendarDays size={28} />
                  <p>No hay tarjetas registradas para calcular pagos del mes.</p>
                </div>
              ) : (
                <div className="monthly-payments-list">
                  {monthlyCardPayments.map((payment) => (
                    <article className="monthly-payment-item" key={payment.id}>
                      <div>
                        <p className="movement-meta">{payment.label}</p>
                        <h3>{money.format(payment.amount)}</h3>
                        <span>Pago: {toDateInput(payment.dueDate)}</span>
                      </div>
                      <div className="charge-right">
                        <strong>Día {payment.dueDate.getDate()}</strong>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </aside>
        </section>
      </main>

      {isCardModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeCardModal}>
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
                <span>Saldo actual</span>
                <input
                  type="number"
                  min="0"
                  step="1"
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
                <button type="submit" className="primary-button">
                  {editingCardId ? 'Guardar cambios' : 'Guardar tarjeta'}
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isChargeModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeChargeModal}>
          <section className="modal-card" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <div>
                <p className="eyebrow">Movimientos</p>
                <h2>Registrar compra o gasto</h2>
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
                <span>Concepto</span>
                <input
                  value={chargeForm.concept}
                  onChange={(event) => setChargeForm((current) => ({ ...current, concept: event.target.value }))}
                  placeholder="Ej. Supermercado, gasolina, Amazon"
                  required
                />
              </label>

              <label className="field">
                <span>Monto</span>
                <input
                  type="number"
                  min="1"
                  step="1"
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
                <button type="submit" className="primary-button">
                  Guardar gasto
                </button>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {isManageCardsModalOpen ? (
        <div className="modal-backdrop" role="presentation" onClick={closeManageCardsModal}>
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
                    closeManageCardsModal()
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
                      closeManageCardsModal()
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
                        <th>Saldo</th>
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
                                    closeManageCardsModal()
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
        <div className="modal-backdrop" role="presentation" onClick={closePurchasesModal}>
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
                <span className="section-badge">{recentCharges.length} registros</span>
                <button
                  type="button"
                  className="pill-button secondary"
                  onClick={() => {
                    closePurchasesModal()
                    openChargeModal()
                  }}
                >
                  <ArrowLeftRight size={16} />
                  Nuevo gasto
                </button>
              </div>
            </div>

            {recentCharges.length === 0 ? (
              <div className="empty-state compact">
                <Banknote size={28} />
                <p>No hay compras registradas.</p>
              </div>
            ) : (
              <div className="purchases-modal-list">
                {recentCharges.map((charge) => (
                  <article className="charge-item" key={charge.id}>
                    <div>
                      <p className="movement-meta">{charge.cardLabel}</p>
                      <h3>{charge.concept}</h3>
                      <span>{charge.date}</span>
                    </div>
                    <div className="charge-right">
                      <strong>{money.format(charge.amount)}</strong>
                      <button type="button" className="icon-button danger" onClick={() => handleDeleteCharge(charge)} aria-label="Eliminar gasto">
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        </div>
      ) : null}
    </div>
  )
}

export default App