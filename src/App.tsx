import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Swal from 'sweetalert2'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import { addDoc, collection, deleteDoc, doc, getDocs, updateDoc } from 'firebase/firestore'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarRange,
  Pencil,
  Plus,
  Settings,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { auth, db, isFirebaseConfigured, missingFirebaseEnvKeys } from './lib/firebase'

type TransactionKind = 'income' | 'expense'

type Transaction = {
  id: string
  kind: TransactionKind
  concept: string
  category: string
  amount: number
  date: string
}

const today = new Date()

const toDateInput = (date: Date) => {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000)
  return local.toISOString().slice(0, 10)
}
/**
const minusDays = (days: number) => {
  const value = new Date(today)
  value.setDate(value.getDate() - days)
  return toDateInput(value)
}**/

const mockTransactions: Transaction[] = [
]

const TRANSACTIONS_STORAGE_KEY = 'miromoney.transactions'
const CATEGORIES_STORAGE_KEY = 'miromoney.categories'
const DEFAULT_ADMIN_EMAIL = import.meta.env.VITE_DEFAULT_LOGIN_EMAIL ?? 'miromoney@gmail.com'
const DEFAULT_ADMIN_PASS = import.meta.env.VITE_DEFAULT_LOGIN_PASSWORD ?? 'miromoney123'

const CATEGORY_OPTIONS: Record<TransactionKind, string[]> = {
  income: ['Freelance', 'Salario', 'Educación', 'Inversiones', 'Otros ingresos'],
  expense: [
    'Hogar',
    'Transporte',
    'Comida',
    'Salud',
    'Suscripciones',
    'Ocio',
    'Servicios',
    'Otros egresos',
  ],
}

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const getStartOfWeek = (date: Date) => {
  const value = new Date(date)
  const day = value.getDay()
  const daysSinceSaturday = (day - 6 + 7) % 7
  value.setDate(value.getDate() - daysSinceSaturday)
  value.setHours(0, 0, 0, 0)
  return value
}

const getWeekEnd = (weekStart: Date) => {
  const end = new Date(weekStart)
  end.setDate(end.getDate() + 6)
  end.setHours(23, 59, 59, 999)
  return end
}

const buildWeeklyReport = (entries: Transaction[], startWeek: Date, endWeek: Date) => {
  const income = entries
    .filter((item) => item.kind === 'income')
    .reduce((acc, item) => acc + item.amount, 0)

  const expense = entries
    .filter((item) => item.kind === 'expense')
    .reduce((acc, item) => acc + item.amount, 0)

  const balance = income - expense
  const savingsRate = income > 0 ? (balance / income) * 100 : 0

  let health: 'Saludable' | 'En alerta' | 'Crítica' = 'Saludable'
  if (balance < 0) {
    health = 'Crítica'
  } else if (savingsRate < 20) {
    health = 'En alerta'
  }

  return {
    startWeek,
    endWeek,
    income,
    expense,
    balance,
    savingsRate,
    health,
    totalMovements: entries.length,
  }
}

const getAuthErrorMessage = (code?: string) => {
  switch (code) {
    case 'auth/configuration-not-found':
    case 'auth/operation-not-allowed':
      return 'Firebase Authentication no esta habilitado. Activa Email/Password en Firebase Console > Authentication > Sign-in method.'
    case 'auth/api-key-not-valid':
    case 'auth/invalid-api-key':
      return 'La API key no corresponde a un proyecto Firebase valido o esta mal configurada.'
    case 'auth/network-request-failed':
      return 'Fallo de red al conectar con Firebase Authentication.'
    default:
      return 'No se pudo autenticar con Firebase. Revisa configuracion y credenciales.'
  }
}

const isDateWithinRange = (dateText: string, startDate: Date, endDate: Date) => {
  const date = new Date(`${dateText}T12:00:00`)
  return date >= startDate && date <= endDate
}

const App = () => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isAuthBootstrapping, setIsAuthBootstrapping] = useState(true)
  const [loginForm, setLoginForm] = useState({
    user: '',
    pass: '',
  })
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    const saved = window.localStorage.getItem(TRANSACTIONS_STORAGE_KEY)

    if (!saved) {
      return mockTransactions
    }

    try {
      const parsed = JSON.parse(saved) as Transaction[]

      if (!Array.isArray(parsed)) {
        return mockTransactions
      }

      const validEntries = parsed.filter(
        (item) =>
          typeof item.id === 'string' &&
          (item.kind === 'income' || item.kind === 'expense') &&
          typeof item.concept === 'string' &&
          typeof item.category === 'string' &&
          typeof item.amount === 'number' &&
          typeof item.date === 'string',
      )

      return validEntries.length > 0 ? validEntries : mockTransactions
    } catch {
      return mockTransactions
    }
  })
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false)
  const [categoryModalKind, setCategoryModalKind] = useState<TransactionKind>('expense')
  const [newCategoryName, setNewCategoryName] = useState('')
  const [editingTransaction, setEditingTransaction] = useState<Transaction | null>(null)
  const [isSyncingCloud, setIsSyncingCloud] = useState(false)
  const [isAuthLoading, setIsAuthLoading] = useState(false)
  const [selectedCategory, setSelectedCategory] = useState('all')
  const [selectedReportWeek, setSelectedReportWeek] = useState(() => toDateInput(getStartOfWeek(new Date())))
  const [formState, setFormState] = useState({
    kind: 'expense' as TransactionKind,
    concept: '',
    category: '',
    amount: '',
    date: toDateInput(today),
  })
  const [categoryOptions, setCategoryOptions] = useState<Record<TransactionKind, string[]>>(() => {
    const saved = window.localStorage.getItem(CATEGORIES_STORAGE_KEY)
    if (!saved) {
      return CATEGORY_OPTIONS
    }

    try {
      const parsed = JSON.parse(saved) as Record<TransactionKind, string[]>
      const income = Array.isArray(parsed.income) ? parsed.income.filter((item) => typeof item === 'string') : []
      const expense = Array.isArray(parsed.expense) ? parsed.expense.filter((item) => typeof item === 'string') : []

      return {
        income: income.length > 0 ? income : CATEGORY_OPTIONS.income,
        expense: expense.length > 0 ? expense : CATEGORY_OPTIONS.expense,
      }
    } catch {
      return CATEGORY_OPTIONS
    }
  })

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions])

  const availableCategories = useMemo(() => {
    return categoryOptions[formState.kind]
  }, [categoryOptions, formState.kind])

  const filterCategories = useMemo(() => {
    return Array.from(
      new Set([...categoryOptions.income, ...categoryOptions.expense, ...transactions.map((item) => item.category)]),
    )
  }, [categoryOptions, transactions])

  const filteredTransactions = useMemo(() => {
    if (selectedCategory === 'all') {
      return sortedTransactions
    }

    return sortedTransactions.filter((item) => item.category === selectedCategory)
  }, [selectedCategory, sortedTransactions])

  const weekOptions = useMemo(() => {
    const weekSet = new Set<string>([toDateInput(getStartOfWeek(new Date()))])

    transactions.forEach((item) => {
      const date = new Date(`${item.date}T12:00:00`)
      weekSet.add(toDateInput(getStartOfWeek(date)))
    })

    return Array.from(weekSet)
      .sort((a, b) => b.localeCompare(a))
      .map((weekStartText) => {
        const startWeek = new Date(`${weekStartText}T12:00:00`)
        startWeek.setHours(0, 0, 0, 0)
        const endWeek = getWeekEnd(startWeek)
        return {
          value: weekStartText,
          startWeek,
          endWeek,
          label: `${startWeek.toLocaleDateString('es-CO')} - ${endWeek.toLocaleDateString('es-CO')}`,
        }
      })
  }, [transactions])

  const currentWeekReport = useMemo(() => {
    const startWeek = getStartOfWeek(new Date())
    const endWeek = getWeekEnd(startWeek)

    const weekEntries = transactions.filter((item) => {
      const date = new Date(`${item.date}T12:00:00`)
      return date >= startWeek && date <= endWeek
    })

    return buildWeeklyReport(weekEntries, startWeek, endWeek)
  }, [transactions])

  const canModifyTransaction = (entry: Transaction) => {
    return isDateWithinRange(entry.date, currentWeekReport.startWeek, currentWeekReport.endWeek)
  }

  const selectedWeekData = useMemo(() => {
    return weekOptions.find((week) => week.value === selectedReportWeek) ?? weekOptions[0]
  }, [selectedReportWeek, weekOptions])

  const report = useMemo(() => {
    if (!selectedWeekData) {
      const startWeek = getStartOfWeek(new Date())
      const endWeek = getWeekEnd(startWeek)
      return buildWeeklyReport([], startWeek, endWeek)
    }

    const weekEntries = transactions.filter((item) => {
      const date = new Date(`${item.date}T12:00:00`)
      return date >= selectedWeekData.startWeek && date <= selectedWeekData.endWeek
    })

    return buildWeeklyReport(weekEntries, selectedWeekData.startWeek, selectedWeekData.endWeek)
  }, [selectedWeekData, transactions])

  useEffect(() => {
    if (weekOptions.length === 0) {
      return
    }

    const exists = weekOptions.some((week) => week.value === selectedReportWeek)
    if (!exists) {
      setSelectedReportWeek(weekOptions[0].value)
    }
  }, [selectedReportWeek, weekOptions])

  useEffect(() => {
    window.localStorage.setItem(TRANSACTIONS_STORAGE_KEY, JSON.stringify(transactions))
  }, [transactions])

  useEffect(() => {
    window.localStorage.setItem(CATEGORIES_STORAGE_KEY, JSON.stringify(categoryOptions))
  }, [categoryOptions])

  useEffect(() => {
    setCategoryOptions((prev) => {
      const incomeFromTransactions = transactions
        .filter((item) => item.kind === 'income')
        .map((item) => item.category)
      const expenseFromTransactions = transactions
        .filter((item) => item.kind === 'expense')
        .map((item) => item.category)

      const nextIncome = Array.from(new Set([...prev.income, ...incomeFromTransactions]))
      const nextExpense = Array.from(new Set([...prev.expense, ...expenseFromTransactions]))

      if (
        nextIncome.length === prev.income.length &&
        nextExpense.length === prev.expense.length
      ) {
        return prev
      }

      return {
        income: nextIncome,
        expense: nextExpense,
      }
    })
  }, [transactions])

  useEffect(() => {
    if (!isFirebaseConfigured || !auth) {
      setIsAuthBootstrapping(false)
      return
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsAuthenticated(Boolean(user))
      setIsAuthBootstrapping(false)
    })

    return () => {
      unsubscribe()
    }
  }, [])

  useEffect(() => {
    if (!isAuthenticated || !isFirebaseConfigured || !db) {
      return
    }

    const database = db

    let isMounted = true

    const loadCloudTransactions = async () => {
      setIsSyncingCloud(true)
      try {
        const transactionsCollection = collection(database, 'transactions')
        const snapshot = await getDocs(transactionsCollection)

        if (snapshot.empty) {
          const seedSource = transactions.length > 0 ? transactions : mockTransactions

          if (seedSource.length > 0) {
            const createdRefs = await Promise.all(
              seedSource.map((item) =>
                addDoc(transactionsCollection, {
                  kind: item.kind,
                  concept: item.concept,
                  category: item.category,
                  amount: item.amount,
                  date: item.date,
                }),
              ),
            )

            const seededTransactions: Transaction[] = createdRefs
              .map((ref, index) => ({
                id: ref.id,
                kind: seedSource[index].kind,
                concept: seedSource[index].concept,
                category: seedSource[index].category,
                amount: seedSource[index].amount,
                date: seedSource[index].date,
              }))
              .sort((a, b) => b.date.localeCompare(a.date))

            if (isMounted) {
              setTransactions(seededTransactions)
            }

            return
          }
        }

        const cloudTransactions: Transaction[] = snapshot.docs
          .map((record) => {
            const data = record.data()

            if (
              (data.kind !== 'income' && data.kind !== 'expense') ||
              typeof data.concept !== 'string' ||
              typeof data.category !== 'string' ||
              typeof data.amount !== 'number' ||
              typeof data.date !== 'string'
            ) {
              return null
            }

            return {
              id: record.id,
              kind: data.kind,
              concept: data.concept,
              category: data.category,
              amount: data.amount,
              date: data.date,
            }
          })
          .filter((item): item is Transaction => item !== null)
          .sort((a, b) => b.date.localeCompare(a.date))

        if (isMounted) {
          setTransactions(cloudTransactions)
        }
      } catch {
        if (isMounted) {
          void Swal.fire({
            title: 'Error de sincronizacion',
            text: 'No se pudo cargar/sincronizar Firebase. Revisa reglas de Firestore y credenciales.',
            icon: 'error',
            confirmButtonColor: '#946df8',
          })
        }
      } finally {
        if (isMounted) {
          setIsSyncingCloud(false)
        }
      }
    }

    void loadCloudTransactions()

    return () => {
      isMounted = false
    }
  }, [isAuthenticated])

  const openCreateModal = () => {
    setEditingTransaction(null)
    setFormState({
      kind: 'expense',
      concept: '',
      category: '',
      amount: '',
      date: toDateInput(today),
    })
    setIsEntryModalOpen(true)
  }

  const openCategoryModal = (kind: TransactionKind) => {
    setCategoryModalKind(kind)
    setNewCategoryName('')
    setIsCategoryModalOpen(true)
  }

  const openCategoryModalFromList = () => {
    const inferredKind: TransactionKind = categoryOptions.income.includes(selectedCategory)
      ? 'income'
      : 'expense'
    openCategoryModal(inferredKind)
  }

  const closeCategoryModal = () => {
    setIsCategoryModalOpen(false)
    setNewCategoryName('')
  }

  const addCategory = () => {
    const value = newCategoryName.trim()

    if (!value) {
      return
    }

    const exists = categoryOptions[categoryModalKind].some(
      (item) => item.toLowerCase() === value.toLowerCase(),
    )

    if (exists) {
      void Swal.fire({
        title: 'Categoria duplicada',
        text: 'Ya existe una categoria con ese nombre.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    setCategoryOptions((prev) => ({
      ...prev,
      [categoryModalKind]: [...prev[categoryModalKind], value],
    }))
    setNewCategoryName('')
  }

  const renameCategory = async (kind: TransactionKind, oldName: string) => {
    const result = await Swal.fire({
      title: 'Actualizar categoria',
      input: 'text',
      inputValue: oldName,
      inputPlaceholder: 'Nuevo nombre',
      showCancelButton: true,
      confirmButtonText: 'Guardar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#946df8',
      inputValidator: (value) => {
        if (!value.trim()) {
          return 'El nombre es obligatorio.'
        }

        const isDuplicate = categoryOptions[kind].some(
          (item) => item.toLowerCase() === value.trim().toLowerCase() && item !== oldName,
        )

        if (isDuplicate) {
          return 'Ya existe una categoria con ese nombre.'
        }

        return undefined
      },
    })

    if (!result.isConfirmed || !result.value) {
      return
    }

    const newName = result.value.trim()
    if (newName === oldName) {
      return
    }

    const affected = transactions.filter((item) => item.kind === kind && item.category === oldName)

    if (isFirebaseConfigured && db && affected.length > 0) {
      const database = db
      try {
        await Promise.all(
          affected.map((item) => updateDoc(doc(database, 'transactions', item.id), { category: newName })),
        )
      } catch {
        void Swal.fire({
          title: 'No se pudo actualizar en Firebase',
          text: 'Intenta nuevamente para evitar desincronizacion.',
          icon: 'error',
          confirmButtonColor: '#946df8',
        })
        return
      }
    }

    setCategoryOptions((prev) => ({
      ...prev,
      [kind]: prev[kind].map((item) => (item === oldName ? newName : item)),
    }))

    if (affected.length > 0) {
      setTransactions((prev) =>
        prev.map((item) =>
          item.kind === kind && item.category === oldName ? { ...item, category: newName } : item,
        ),
      )
    }

    setFormState((prev) => {
      if (prev.kind === kind && prev.category === oldName) {
        return { ...prev, category: newName }
      }
      return prev
    })
  }

  const removeCategory = (kind: TransactionKind, categoryName: string) => {
    const usedCount = transactions.filter(
      (item) => item.kind === kind && item.category === categoryName,
    ).length

    if (usedCount > 0) {
      void Swal.fire({
        title: 'No se puede eliminar',
        text: 'La categoria ya esta asociada a movimientos. Puedes actualizar su nombre.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    setCategoryOptions((prev) => ({
      ...prev,
      [kind]: prev[kind].filter((item) => item !== categoryName),
    }))

    setFormState((prev) => {
      if (prev.kind === kind && prev.category === categoryName) {
        return { ...prev, category: '' }
      }
      return prev
    })

    setSelectedCategory((prev) => (prev === categoryName ? 'all' : prev))
  }

  const openEditModal = (entry: Transaction) => {
    if (!canModifyTransaction(entry)) {
      void Swal.fire({
        title: 'Semana cerrada',
        text: 'Solo puedes editar movimientos de la semana actual.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    setEditingTransaction(entry)
    setFormState({
      kind: entry.kind,
      concept: entry.concept,
      category: entry.category,
      amount: String(entry.amount),
      date: entry.date,
    })
    setIsEntryModalOpen(true)
  }

  const submitLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    if (!isFirebaseConfigured || !auth) {
      void Swal.fire({
        title: 'Firebase no configurado',
        text:
          missingFirebaseEnvKeys.length > 0
            ? `Faltan variables: ${missingFirebaseEnvKeys.join(', ')}`
            : 'Configura las variables de entorno para usar autenticacion Firebase.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    if (loginForm.user.trim().toLowerCase() !== DEFAULT_ADMIN_EMAIL.toLowerCase()) {
      void Swal.fire({
        title: 'Usuario no valido',
        text: `Usa el usuario ${DEFAULT_ADMIN_EMAIL}.`,
        icon: 'error',
        confirmButtonColor: '#946df8',
      })
      return
    }

    setIsAuthLoading(true)
    try {
      await signInWithEmailAndPassword(auth, DEFAULT_ADMIN_EMAIL, loginForm.pass)
    } catch (error) {
      const code = (error as { code?: string }).code
      const isCredentialsError =
        code === 'auth/invalid-credential' ||
        code === 'auth/wrong-password' ||
        code === 'auth/user-not-found' ||
        code === 'auth/invalid-email'

      void Swal.fire({
        title: isCredentialsError ? 'Credenciales incorrectas' : 'Error de autenticacion Firebase',
        text: isCredentialsError ? 'Verifica usuario y contraseña.' : getAuthErrorMessage(code),
        icon: 'error',
        confirmButtonColor: '#946df8',
      })
      setLoginForm((prev) => ({ ...prev, pass: '' }))
      return
    } finally {
      setIsAuthLoading(false)
    }

    void Swal.fire({
      title: 'Bienvenido',
      text: 'Has iniciado sesión correctamente.',
      icon: 'success',
      timer: 1200,
      showConfirmButton: false,
    })
  }

  const logout = async () => {
    const result = await Swal.fire({
      title: 'Cerrar sesión',
      text: '¿Seguro que deseas salir?',
      icon: 'question',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, salir',
      confirmButtonColor: '#e76262',
      cancelButtonColor: '#7f7f8a',
    })

    if (!result.isConfirmed) {
      return
    }

    if (auth) {
      await signOut(auth)
    }
    setLoginForm({ user: '', pass: '' })
  }

  const closeCreateModal = () => {
    setEditingTransaction(null)
    setIsEntryModalOpen(false)
  }

  const openReportModal = () => {
    setIsReportModalOpen(true)
  }

  const closeReportModal = () => {
    setIsReportModalOpen(false)
  }

  const addTransaction = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const parsedAmount = Number(formState.amount)

    if (!formState.concept.trim() || !formState.category.trim() || parsedAmount <= 0) {
      void Swal.fire({
        title: 'Datos incompletos',
        text: 'Agrega concepto, categoría y un monto válido.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    if (
      editingTransaction &&
      !isDateWithinRange(formState.date, currentWeekReport.startWeek, currentWeekReport.endWeek)
    ) {
      void Swal.fire({
        title: 'Fecha no permitida',
        text: 'Un movimiento editable debe mantenerse dentro de la semana actual.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    const payload = {
      kind: formState.kind,
      concept: formState.concept.trim(),
      category: formState.category.trim(),
      amount: parsedAmount,
      date: formState.date,
    }

    if (editingTransaction) {
      if (!canModifyTransaction(editingTransaction)) {
        void Swal.fire({
          title: 'Semana cerrada',
          text: 'No puedes modificar movimientos de semanas anteriores.',
          icon: 'warning',
          confirmButtonColor: '#946df8',
        })
        return
      }

      if (isFirebaseConfigured && db) {
        const database = db
        try {
          await updateDoc(doc(database, 'transactions', editingTransaction.id), payload)
        } catch {
          void Swal.fire({
            title: 'No se pudo editar en Firebase',
            text: 'Revisa tu conexion e intenta de nuevo.',
            icon: 'error',
            confirmButtonColor: '#946df8',
          })
          return
        }
      }

      setTransactions((prev) =>
        prev.map((item) => (item.id === editingTransaction.id ? { ...item, ...payload } : item)),
      )
    } else {
      let newTransaction: Transaction = {
        id: Date.now().toString(),
        ...payload,
      }

      if (isFirebaseConfigured && db) {
        const database = db
        try {
          const ref = await addDoc(collection(database, 'transactions'), payload)
          newTransaction = {
            id: ref.id,
            ...payload,
          }
        } catch {
          void Swal.fire({
            title: 'Sincronizacion pendiente',
            text: 'No se pudo guardar en Firebase, se guardo localmente.',
            icon: 'warning',
            confirmButtonColor: '#946df8',
          })
        }
      }

      setTransactions((prev) => [newTransaction, ...prev])
    }

    setEditingTransaction(null)
    setFormState({
      kind: 'expense',
      concept: '',
      category: '',
      amount: '',
      date: toDateInput(today),
    })
    setIsEntryModalOpen(false)

    void Swal.fire({
      title: editingTransaction ? 'Movimiento actualizado' : 'Movimiento guardado',
      text: editingTransaction
        ? 'El registro fue actualizado correctamente.'
        : 'Tu registro fue agregado correctamente.',
      icon: 'success',
      timer: 1300,
      showConfirmButton: false,
    })
  }

  const removeTransaction = async (entry: Transaction) => {
    if (!canModifyTransaction(entry)) {
      void Swal.fire({
        title: 'Semana cerrada',
        text: 'No puedes eliminar movimientos de semanas anteriores.',
        icon: 'warning',
        confirmButtonColor: '#946df8',
      })
      return
    }

    const result = await Swal.fire({
      title: 'Eliminar movimiento',
      text: `¿Deseas borrar "${entry.concept}"?`,
      icon: 'question',
      showCancelButton: true,
      cancelButtonText: 'Cancelar',
      confirmButtonText: 'Sí, eliminar',
      confirmButtonColor: '#e76262',
      cancelButtonColor: '#7f7f8a',
    })

    if (!result.isConfirmed) {
      return
    }

    if (isFirebaseConfigured && db) {
      const database = db
      try {
        await deleteDoc(doc(database, 'transactions', entry.id))
      } catch {
        void Swal.fire({
          title: 'No se pudo eliminar en Firebase',
          text: 'Revisa tu conexion e intenta de nuevo.',
          icon: 'error',
          confirmButtonColor: '#946df8',
        })
        return
      }
    }

    setTransactions((prev) => prev.filter((item) => item.id !== entry.id))

    void Swal.fire({
      title: 'Eliminado',
      text: 'El movimiento se eliminó del registro.',
      icon: 'success',
      timer: 1100,
      showConfirmButton: false,
    })
  }

  if (!isAuthenticated) {
    if (isAuthBootstrapping) {
      return (
        <main className="app-shell">
          <section className="login-card">
            <p className="eyebrow">MiroMoney</p>
            <h1>Conectando...</h1>
            <p className="login-help">Validando sesión con Firebase Authentication.</p>
          </section>
        </main>
      )
    }

    return (
      <main className="app-shell">
        <section className="login-card">
          <p className="eyebrow">MiroMoney</p>
          <h1>Iniciar sesión</h1>
          <p className="login-help">Accede para gestionar ingresos, egresos y reportes semanales.</p>

          <form className="form-grid" onSubmit={submitLogin}>
            <label>
              Usuario
              <input
                type="text"
                value={loginForm.user}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, user: event.target.value }))}
                placeholder="Ingresa tu usuario"
                autoComplete="username"
                required
              />
            </label>

            <label>
              Contraseña
              <input
                type="password"
                value={loginForm.pass}
                onChange={(event) => setLoginForm((prev) => ({ ...prev, pass: event.target.value }))}
                placeholder="Ingresa tu contraseña"
                autoComplete="current-password"
                required
              />
            </label>

            <button className="primary-btn" type="submit" disabled={isAuthLoading}>
              {isAuthLoading ? 'Validando...' : 'Entrar'}
            </button>
          </form>

          <p className="login-note">
            Credenciales por defecto: usuario {DEFAULT_ADMIN_EMAIL}, clave {DEFAULT_ADMIN_PASS}
          </p>
        </section>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="web-board">
        <header className="screen-header">
          <div>
            <p className="eyebrow">Control semanal</p>
            <h1>MiroMoney</h1>
          </div>
          <div className="header-actions">
            <button
              className="icon-ghost-btn"
              type="button"
              onClick={openCategoryModalFromList}
              aria-label="Gestionar categorias"
              title="Gestionar categorias"
            >
              <Settings size={18} />
            </button>
            <button
              className="icon-ghost-btn"
              type="button"
              onClick={openReportModal}
              aria-label="Abrir reporte semanal"
              title="Reporte semanal"
            >
              <BarChart3 size={18} />
            </button>
            <button className="primary-btn inline" type="button" onClick={openCreateModal}>
              <Plus size={18} /> Nuevo movimiento
            </button>
            <button className="ghost-btn" type="button" onClick={() => void logout()}>
              Salir
            </button>
          </div>
        </header>

        <section className="content-grid">
          <div>
            <article className="health-banner">
              <div>
                <p>Salud financiera</p>
                <strong>{currentWeekReport.health}</strong>
              </div>
            </article>

            <section className="summary-grid">
              <article className="summary-card income">
                <span>
                  <ArrowUpRight size={16} /> Ingresos
                </span>
                <strong>{money.format(currentWeekReport.income)}</strong>
              </article>
              <article className="summary-card expense">
                <span>
                  <ArrowDownLeft size={16} /> Egresos
                </span>
                <strong>{money.format(currentWeekReport.expense)}</strong>
              </article>
              <article className="summary-card total">
                <span>
                  <Wallet size={16} /> Balance
                </span>
                <strong>{money.format(currentWeekReport.balance)}</strong>
              </article>
            </section>

            <section className="section-title">
              <h2>Movimientos</h2>
              <small>
                {filteredTransactions.length} mostrados de {transactions.length}
              </small>
            </section>

            <section className="filter-row">
              <label htmlFor="category-filter">Filtrar por categoría</label>
              <select
                id="category-filter"
                value={selectedCategory}
                onChange={(event) => setSelectedCategory(event.target.value)}
              >
                <option value="all">Todas las categorías</option>
                {filterCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </section>

            <section className="movement-list">
              {filteredTransactions.length === 0 ? (
                <article className="empty-state">
                  <BriefcaseBusiness size={38} />
                  <p>
                    {transactions.length === 0
                      ? 'Sin movimientos aún. Registra tu primero.'
                      : 'No hay movimientos para esa categoría.'}
                  </p>
                </article>
              ) : (
                filteredTransactions.map((entry) => (
                  <article className="movement-item" key={entry.id}>
                    <div className="movement-main">
                      <p>{entry.concept}</p>
                      <small>
                        {entry.category} • {entry.date}
                      </small>
                    </div>
                    <div className="movement-side">
                      {!canModifyTransaction(entry) && <span className="movement-lock">Cerrado</span>}
                      <strong className={entry.kind === 'income' ? 'positive' : 'negative'}>
                        {entry.kind === 'income' ? '+' : '-'}{money.format(entry.amount)}
                      </strong>
                      {canModifyTransaction(entry) && (
                        <>
                          <button
                            className="action-btn edit"
                            type="button"
                            onClick={() => openEditModal(entry)}
                            aria-label="Editar movimiento"
                          >
                            <Pencil size={15} />
                          </button>
                          <button
                            className="delete-btn"
                            type="button"
                            onClick={() => void removeTransaction(entry)}
                            aria-label="Eliminar movimiento"
                          >
                            <Trash2 size={16} />
                          </button>
                        </>
                      )}
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>

          <aside className="insight-panel">
            <h3>Resumen de la semana</h3>
            <p>Estado actual: <strong>{currentWeekReport.health}</strong></p>
            <p className="cloud-status">
              Firebase: {isFirebaseConfigured ? (isSyncingCloud ? 'sincronizando...' : 'conectado') : 'no configurado'}
            </p>

            <article className="mini-stat">
              <span>Ingresos registrados</span>
              <strong>{money.format(currentWeekReport.income)}</strong>
            </article>

            <article className="mini-stat">
              <span>Egresos registrados</span>
              <strong>{money.format(currentWeekReport.expense)}</strong>
            </article>

            <article className="mini-stat">
              <span>Ahorro semanal</span>
              <strong>{currentWeekReport.savingsRate.toFixed(1)}%</strong>
            </article>

          </aside>
        </section>

        <button className="fab mobile-only" type="button" onClick={openCreateModal}>
          <Plus size={28} />
        </button>

        <p className="app-signature">Desarrollado por: Ing Balmore Ramirez</p>
      </section>

      {isEntryModalOpen && (
        <section className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="modal-panel">
            <header>
              <h3>{editingTransaction ? 'Editar movimiento' : 'Nuevo movimiento'}</h3>
              <button type="button" onClick={closeCreateModal}>
                <X size={18} />
              </button>
            </header>

            <form onSubmit={addTransaction} className="form-grid">
              <div className="toggle-row">
                <button
                  type="button"
                  className={formState.kind === 'income' ? 'active' : ''}
                  onClick={() =>
                    setFormState((prev) => ({ ...prev, kind: 'income', category: '' }))
                  }
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  className={formState.kind === 'expense' ? 'active' : ''}
                  onClick={() =>
                    setFormState((prev) => ({ ...prev, kind: 'expense', category: '' }))
                  }
                >
                  Egreso
                </button>
              </div>

              <label>
                Concepto
                <input
                  value={formState.concept}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, concept: event.target.value }))
                  }
                  placeholder="Ej: Pago de cliente"
                  required
                />
              </label>

              <label>
                Categoría
                <select
                  value={formState.category}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, category: event.target.value }))
                  }
                  required
                >
                  <option value="">Selecciona una categoría</option>
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Monto
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={formState.amount}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, amount: event.target.value }))
                  }
                  placeholder="0.00"
                  required
                />
              </label>

              <label>
                Fecha
                <input
                  type="date"
                  value={formState.date}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, date: event.target.value }))
                  }
                  required
                />
              </label>

              <button className="primary-btn" type="submit">
                {editingTransaction ? 'Guardar cambios' : 'Guardar movimiento'}
              </button>
            </form>
          </article>
        </section>
      )}

      {isCategoryModalOpen && (
        <section className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="modal-panel">
            <header>
              <h3>Gestionar categorias</h3>
              <button type="button" onClick={closeCategoryModal}>
                <X size={18} />
              </button>
            </header>

            <div className="toggle-row">
              <button
                type="button"
                className={categoryModalKind === 'income' ? 'active' : ''}
                onClick={() => setCategoryModalKind('income')}
              >
                Ingreso
              </button>
              <button
                type="button"
                className={categoryModalKind === 'expense' ? 'active' : ''}
                onClick={() => setCategoryModalKind('expense')}
              >
                Egreso
              </button>
            </div>

            <section className="category-add-row">
              <input
                value={newCategoryName}
                onChange={(event) => setNewCategoryName(event.target.value)}
                placeholder="Nueva categoria"
              />
              <button className="primary-btn" type="button" onClick={addCategory}>
                Agregar
              </button>
            </section>

            <section className="category-list">
              {categoryOptions[categoryModalKind].map((categoryName) => {
                const usedCount = transactions.filter(
                  (item) => item.kind === categoryModalKind && item.category === categoryName,
                ).length

                return (
                  <article className="category-item" key={`${categoryModalKind}-${categoryName}`}>
                    <div>
                      <p>{categoryName}</p>
                      <small>{usedCount > 0 ? `${usedCount} movimiento(s)` : 'Sin uso'}</small>
                    </div>
                    <div className="category-actions">
                      <button
                        className="action-btn edit"
                        type="button"
                        onClick={() => void renameCategory(categoryModalKind, categoryName)}
                        aria-label="Actualizar categoria"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        className="delete-btn"
                        type="button"
                        onClick={() => removeCategory(categoryModalKind, categoryName)}
                        aria-label="Eliminar categoria"
                        disabled={usedCount > 0}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </article>
                )
              })}
            </section>
          </article>
        </section>
      )}

      {isReportModalOpen && (
        <section className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="modal-panel report">
            <header>
              <h3>Reporte semanal</h3>
              <button type="button" onClick={closeReportModal}>
                <X size={18} />
              </button>
            </header>

            <section className="report-filter-row">
              <label htmlFor="week-report-filter">Semana</label>
              <select
                id="week-report-filter"
                value={selectedReportWeek}
                onChange={(event) => setSelectedReportWeek(event.target.value)}
              >
                {weekOptions.map((week) => (
                  <option key={week.value} value={week.value}>
                    {week.label}
                  </option>
                ))}
              </select>
            </section>

            <p className="report-range">
              <CalendarRange size={16} />
              {report.startWeek.toLocaleDateString('es-CO')} - {report.endWeek.toLocaleDateString('es-CO')}
            </p>

            <div className="report-metrics">
              <article>
                <span>Ingresos</span>
                <strong>{money.format(report.income)}</strong>
              </article>
              <article>
                <span>Egresos</span>
                <strong>{money.format(report.expense)}</strong>
              </article>
              <article>
                <span>Balance</span>
                <strong>{money.format(report.balance)}</strong>
              </article>
              <article>
                <span>Movimientos</span>
                <strong>{report.totalMovements}</strong>
              </article>
            </div>

            <article className="health-scale">
              <p>Ahorro semanal</p>
              <strong>{report.savingsRate.toFixed(1)}%</strong>
              <div>
                <span style={{ width: `${Math.max(0, Math.min(100, report.savingsRate))}%` }} />
              </div>
            </article>

            <button
              className="primary-btn"
              type="button"
              onClick={() => {
                closeReportModal()
                void Swal.fire({
                  title: `Estado ${report.health}`,
                  text:
                    report.health === 'Saludable'
                      ? 'Vas bien. Mantén tu nivel de ahorro.'
                      : report.health === 'En alerta'
                        ? 'Estás justo. Revisa gastos variables.'
                        : 'Gastaste más de lo que ingresaste esta semana.',
                  icon:
                    report.health === 'Saludable'
                      ? 'success'
                      : report.health === 'En alerta'
                        ? 'warning'
                        : 'error',
                  confirmButtonColor: '#946df8',
                })
              }}
            >
              Evaluar mi salud
            </button>
          </article>
        </section>
      )}
    </main>
  )
}

export default App
