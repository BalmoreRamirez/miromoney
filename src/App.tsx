import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import Swal from 'sweetalert2'
import {
  ArrowDownLeft,
  ArrowUpRight,
  BarChart3,
  BriefcaseBusiness,
  CalendarRange,
  Plus,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'

type TransactionKind = 'income' | 'expense'

type Transaction = {
  id: number
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

const minusDays = (days: number) => {
  const value = new Date(today)
  value.setDate(value.getDate() - days)
  return toDateInput(value)
}

const mockTransactions: Transaction[] = [
  {
    id: 1,
    kind: 'income',
    concept: 'Proyecto landing page',
    category: 'Freelance',
    amount: 1280,
    date: minusDays(0),
  },
  {
    id: 2,
    kind: 'expense',
    concept: 'Mercado semanal',
    category: 'Hogar',
    amount: 93.5,
    date: minusDays(1),
  },
  {
    id: 3,
    kind: 'expense',
    concept: 'Spotify + Netflix',
    category: 'Suscripciones',
    amount: 28.99,
    date: minusDays(2),
  },
  {
    id: 4,
    kind: 'income',
    concept: 'Clase de asesoría',
    category: 'Educación',
    amount: 140,
    date: minusDays(3),
  },
  {
    id: 5,
    kind: 'expense',
    concept: 'Gasolina',
    category: 'Transporte',
    amount: 54,
    date: minusDays(4),
  },
  {
    id: 6,
    kind: 'expense',
    concept: 'Cena con amigos',
    category: 'Ocio',
    amount: 46,
    date: minusDays(5),
  },
]

const money = new Intl.NumberFormat('es-CO', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
})

const getStartOfWeek = (date: Date) => {
  const value = new Date(date)
  const day = value.getDay()
  const diff = day === 0 ? -6 : 1 - day
  value.setDate(value.getDate() + diff)
  value.setHours(0, 0, 0, 0)
  return value
}

const App = () => {
  const [transactions, setTransactions] = useState<Transaction[]>(mockTransactions)
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [formState, setFormState] = useState({
    kind: 'expense' as TransactionKind,
    concept: '',
    category: '',
    amount: '',
    date: toDateInput(today),
  })

  const sortedTransactions = useMemo(() => {
    return [...transactions].sort((a, b) => b.date.localeCompare(a.date))
  }, [transactions])

  const report = useMemo(() => {
    const startWeek = getStartOfWeek(new Date())
    const endWeek = new Date(startWeek)
    endWeek.setDate(endWeek.getDate() + 6)

    const weekEntries = transactions.filter((item) => {
      const date = new Date(`${item.date}T12:00:00`)
      return date >= startWeek && date <= endWeek
    })

    const income = weekEntries
      .filter((item) => item.kind === 'income')
      .reduce((acc, item) => acc + item.amount, 0)

    const expense = weekEntries
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
      totalMovements: weekEntries.length,
    }
  }, [transactions])

  const openCreateModal = () => {
    setIsEntryModalOpen(true)
  }

  const closeCreateModal = () => {
    setIsEntryModalOpen(false)
  }

  const openReportModal = () => {
    setIsReportModalOpen(true)
  }

  const closeReportModal = () => {
    setIsReportModalOpen(false)
  }

  const addTransaction = (event: FormEvent<HTMLFormElement>) => {
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

    const newTransaction: Transaction = {
      id: Date.now(),
      kind: formState.kind,
      concept: formState.concept.trim(),
      category: formState.category.trim(),
      amount: parsedAmount,
      date: formState.date,
    }

    setTransactions((prev) => [newTransaction, ...prev])
    setFormState({
      kind: 'expense',
      concept: '',
      category: '',
      amount: '',
      date: toDateInput(today),
    })
    setIsEntryModalOpen(false)

    void Swal.fire({
      title: 'Movimiento guardado',
      text: 'Tu registro fue agregado correctamente.',
      icon: 'success',
      timer: 1300,
      showConfirmButton: false,
    })
  }

  const removeTransaction = async (entry: Transaction) => {
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

    setTransactions((prev) => prev.filter((item) => item.id !== entry.id))

    void Swal.fire({
      title: 'Eliminado',
      text: 'El movimiento se eliminó del registro.',
      icon: 'success',
      timer: 1100,
      showConfirmButton: false,
    })
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
            <button className="ghost-btn" type="button" onClick={openReportModal}>
              <BarChart3 size={18} /> Reporte
            </button>
            <button className="primary-btn inline" type="button" onClick={openCreateModal}>
              <Plus size={18} /> Nuevo movimiento
            </button>
          </div>
        </header>

        <section className="content-grid">
          <div>
            <article className="health-banner">
              <div>
                <p>Salud financiera</p>
                <strong>{report.health}</strong>
              </div>
              <button type="button" onClick={openReportModal}>
                Ver reporte semanal
              </button>
            </article>

            <section className="summary-grid">
              <article className="summary-card income">
                <span>
                  <ArrowUpRight size={16} /> Ingresos
                </span>
                <strong>{money.format(report.income)}</strong>
              </article>
              <article className="summary-card expense">
                <span>
                  <ArrowDownLeft size={16} /> Egresos
                </span>
                <strong>{money.format(report.expense)}</strong>
              </article>
              <article className="summary-card total">
                <span>
                  <Wallet size={16} /> Balance
                </span>
                <strong>{money.format(report.balance)}</strong>
              </article>
            </section>

            <section className="section-title">
              <h2>Movimientos</h2>
              <small>{transactions.length} en total</small>
            </section>

            <section className="movement-list">
              {sortedTransactions.length === 0 ? (
                <article className="empty-state">
                  <BriefcaseBusiness size={38} />
                  <p>Sin movimientos aún. Registra tu primero.</p>
                </article>
              ) : (
                sortedTransactions.map((entry) => (
                  <article className="movement-item" key={entry.id}>
                    <div className="movement-main">
                      <p>{entry.concept}</p>
                      <small>
                        {entry.category} • {entry.date}
                      </small>
                    </div>
                    <div className="movement-side">
                      <strong className={entry.kind === 'income' ? 'positive' : 'negative'}>
                        {entry.kind === 'income' ? '+' : '-'}{money.format(entry.amount)}
                      </strong>
                      <button
                        className="delete-btn"
                        type="button"
                        onClick={() => void removeTransaction(entry)}
                        aria-label="Eliminar movimiento"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))
              )}
            </section>
          </div>

          <aside className="insight-panel">
            <h3>Resumen de la semana</h3>
            <p>Estado actual: <strong>{report.health}</strong></p>

            <article className="mini-stat">
              <span>Ingresos registrados</span>
              <strong>{money.format(report.income)}</strong>
            </article>

            <article className="mini-stat">
              <span>Egresos registrados</span>
              <strong>{money.format(report.expense)}</strong>
            </article>

            <article className="mini-stat">
              <span>Ahorro semanal</span>
              <strong>{report.savingsRate.toFixed(1)}%</strong>
            </article>

            <button className="ghost-btn full" type="button" onClick={openReportModal}>
              <CalendarRange size={18} /> Abrir reporte detallado
            </button>
          </aside>
        </section>

        <button className="fab mobile-only" type="button" onClick={openCreateModal}>
          <Plus size={28} />
        </button>
      </section>

      {isEntryModalOpen && (
        <section className="modal-backdrop" role="dialog" aria-modal="true">
          <article className="modal-panel">
            <header>
              <h3>Nuevo movimiento</h3>
              <button type="button" onClick={closeCreateModal}>
                <X size={18} />
              </button>
            </header>

            <form onSubmit={addTransaction} className="form-grid">
              <div className="toggle-row">
                <button
                  type="button"
                  className={formState.kind === 'income' ? 'active' : ''}
                  onClick={() => setFormState((prev) => ({ ...prev, kind: 'income' }))}
                >
                  Ingreso
                </button>
                <button
                  type="button"
                  className={formState.kind === 'expense' ? 'active' : ''}
                  onClick={() => setFormState((prev) => ({ ...prev, kind: 'expense' }))}
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
                <input
                  value={formState.category}
                  onChange={(event) =>
                    setFormState((prev) => ({ ...prev, category: event.target.value }))
                  }
                  placeholder="Ej: Freelance"
                  required
                />
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
                Guardar movimiento
              </button>
            </form>
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
