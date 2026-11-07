import { createFileRoute } from '@tanstack/react-router'
import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'

import {
  apiRequest,
  formatMoney,
  type Balance,
  type Bill,
  type Home,
  type Member,
} from '../lib/api'

export const Route = createFileRoute('/')({
  component: HomePage,
})

function HomePage() {
  const [home, setHome] = useState<Home | null>(null)

  const [homeName, setHomeName] = useState('')
  const [existingHomeId, setExistingHomeId] = useState('')
  const [memberName, setMemberName] = useState('')
  const [billTitle, setBillTitle] = useState('')
  const [billAmount, setBillAmount] = useState('')

  const [members, setMembers] = useState<Member[]>([])
  const [bills, setBills] = useState<Bill[]>([])
  const [balances, setBalances] = useState<Balance[]>([])

  const [loading, setLoading] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')

  const [refreshKey, setRefreshKey] = useState(0)

  // Keep the same key when retrying a failed payment.
  const paymentKeys = useRef(new Map<string, string>())

  // Load members, bills and balances.
  useEffect(() => {
  if (!home) return

  // Store home ID in a separate constant
  const homeId = home.id

  const controller = new AbortController()

  async function loadData() {
    setLoading(true)
    setError('')

    try {
      const options: RequestInit = {
        signal: controller.signal,
      }

      const [memberData, billData, balanceData] =
        await Promise.all([
          apiRequest<{ members: Member[] }>(
            `/api/homes/${homeId}/members`,
            options,
          ),

          apiRequest<{ bills: Bill[] }>(
            `/api/homes/${homeId}/bills`,
            options,
          ),

          apiRequest<{ balances: Balance[] }>(
            `/api/homes/${homeId}/balances`,
            options,
          ),
        ])

      if (controller.signal.aborted) return

      setMembers(memberData.members)
      setBills(billData.bills)
      setBalances(balanceData.balances)

    } catch (err) {
      if (controller.signal.aborted) return

      setError(
        err instanceof Error
          ? err.message
          : 'Unable to load home data',
      )
    } finally {
      if (!controller.signal.aborted) {
        setLoading(false)
      }
    }
  }

  void loadData()

  return () => controller.abort()

}, [home?.id, refreshKey])
  // Create home.
  async function createHome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const created = await apiRequest<Home>('/api/homes', {
        method: 'POST',
        body: JSON.stringify({
          name: homeName,
        }),
      })

      setHome(created)
      setHomeName('')
      setSuccess('Home created successfully')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create home',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Load an existing home.
  async function loadExistingHome(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault()

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      const id = existingHomeId.trim()

      await apiRequest<{ members: Member[] }>(
        `/api/homes/${id}/members`,
      )

      setHome({
        id,
        name: 'Shared Home',
      })

      setExistingHomeId('')
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Home not found',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Add member.
  async function addMember(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      await apiRequest<Member>(
        `/api/homes/${home.id}/members`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: memberName,
          }),
        },
      )

      setMemberName('')
      setSuccess('Member added successfully')
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to add member',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Create bill.
  async function createBill(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!home) return

    const amount = Number(billAmount)

    if (
      !Number.isSafeInteger(amount) ||
      amount <= 0
    ) {
      setError('Enter a valid positive whole number of cents')
      return
    }

    setError('')
    setSuccess('')
    setSubmitting(true)

    try {
      await apiRequest<Bill>(
        `/api/homes/${home.id}/bills`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: billTitle,
            totalCents: amount,
          }),
        },
      )

      setBillTitle('')
      setBillAmount('')
      setSuccess('Bill created and split successfully')
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Unable to create bill',
      )
    } finally {
      setSubmitting(false)
    }
  }

  // Pay one share.
  async function payShare(billId: string, shareId: string) {
    const key = paymentKeys.current.get(shareId) ?? crypto.randomUUID()

    paymentKeys.current.set(shareId, key)

    setError('')
    setSuccess('')

    try {
      await apiRequest(
        `/api/bills/${billId}/shares/${shareId}/pay`,
        {
          method: 'POST',
          headers: {
            'Idempotency-Key': key,
          },
        },
      )

      paymentKeys.current.delete(shareId)

      setSuccess('Payment completed successfully')
      setRefreshKey((value) => value + 1)
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Payment failed',
      )
    }
  }

  const totalOutstanding = balances.reduce(
    (total, item) => total + item.outstandingCents,
    0,
  )

  return (
    <main className="page">
      <header className="header">
        <div>
          <p className="eyebrow">HOUSEHOLD FINANCE</p>
          <h1>Shared Bill Splitter</h1>
          <p className="subtitle">
            Manage your household expenses in one place.
          </p>
        </div>

        <div className="brand">BS</div>
      </header>

      {error && (
        <div className="alert error" role="alert">
          {error}
          <button onClick={() => setError('')} aria-label="Dismiss">
            ×
          </button>
        </div>
      )}

      {success && (
        <div className="alert success" role="status">
          {success}
        </div>
      )}

      {!home ? (
        <section className="card setup-card">
          <h2>Create your home</h2>

          <form onSubmit={createHome}>
            <label>Home name</label>

            <input
              value={homeName}
              onChange={(e) => setHomeName(e.target.value)}
              placeholder="Example: My Apartment"
              required
            />

            <button disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Home'}
            </button>
          </form>

          <div className="separator">OR</div>

          <form onSubmit={loadExistingHome}>
            <label>Existing Home ID</label>

            <input
              value={existingHomeId}
              onChange={(e) => setExistingHomeId(e.target.value)}
              placeholder="Enter your home ID"
              required
            />

            <button
              type="submit"
              className="secondary"
              disabled={submitting}
            >
              Load Existing Home
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="welcome">
            <div>
              <p className="eyebrow">CURRENT HOME</p>
              <h2>{home.name}</h2>
              <p className="home-id">ID: {home.id}</p>
            </div>

            <button
              className="secondary"
              onClick={() => {
                setHome(null)
                setMembers([])
                setBills([])
                setBalances([])
                setError('')
                setSuccess('')
              }}
            >
              Change Home
            </button>
          </section>

          <section className="summary-grid">
            <div className="summary-card">
              <p>Total Members</p>
              <h2>{members.length}</h2>
            </div>

            <div className="summary-card">
              <p>Total Bills</p>
              <h2>{bills.length}</h2>
            </div>

            <div className="summary-card">
              <p>Outstanding</p>
              <h2>{formatMoney(totalOutstanding)}</h2>
            </div>
          </section>

          <section className="forms-grid">
            <div className="card">
              <h3>Add Member</h3>

              <form onSubmit={addMember}>
                <label>Member name</label>

                <input
                  value={memberName}
                  onChange={(e) => setMemberName(e.target.value)}
                  placeholder="Enter member name"
                  required
                />

                <button disabled={submitting}>
                  Add Member
                </button>
              </form>
            </div>

            <div className="card">
              <h3>Create Bill</h3>

              <form onSubmit={createBill}>
                <label>Bill title</label>

                <input
                  value={billTitle}
                  onChange={(e) => setBillTitle(e.target.value)}
                  placeholder="Electricity Bill"
                  required
                />

                <label>Amount in cents</label>

                <input
                  type="number"
                  min="1"
                  step="1"
                  value={billAmount}
                  onChange={(e) => setBillAmount(e.target.value)}
                  placeholder="Example: 10000"
                  required
                />

                <button disabled={submitting}>
                  Create & Split Bill
                </button>
              </form>
            </div>
          </section>

          <section className="card">
            <h3>Home Members</h3>

            {members.length === 0 ? (
              <p className="muted">No members added yet.</p>
            ) : (
              <div className="member-list">
                {members.map((member) => (
                  <div className="member-item" key={member.id}>
                    <div className="avatar">
                      {member.name.charAt(0).toUpperCase()}
                    </div>

                    <span>{member.name}</span>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <h3>All Bills</h3>
              <span>{bills.length} bills</span>
            </div>

            {loading ? (
              <p className="muted">Loading bills...</p>
            ) : bills.length === 0 ? (
              <p className="muted">
                No bills available. Create your first bill.
              </p>
            ) : (
              <div className="bill-list">
                {bills.map((bill) => (
                  <article className="bill-card" key={bill.id}>
                    <div className="bill-heading">
                      <div>
                        <h4>{bill.title}</h4>
                        <p>
                          Total: {formatMoney(bill.totalCents)}
                        </p>
                      </div>

                      <span className="bill-count">
                        {bill.shares.length} shares
                      </span>
                    </div>

                    {bill.shares.map((share) => {
                      const member = members.find(
                        (item) => item.id === share.memberId,
                      )

                      return (
                        <div className="share-row" key={share.id}>
                          <div>
                            <strong>
                              {member?.name ?? 'Unknown member'}
                            </strong>

                            <p>
                              {formatMoney(share.amountCents)}
                            </p>
                          </div>

                          {share.paidAt ? (
                            <span className="status paid">
                              Paid
                            </span>
                          ) : (
                            <div className="payment-action">
                              <span className="status unpaid">
                                Unpaid
                              </span>

                              <button
                                className="pay-button"
                                onClick={() =>
                                  void payShare(bill.id, share.id)
                                }
                              >
                                Pay
                              </button>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="card">
            <h3>Outstanding Balances</h3>

            {balances.length === 0 ? (
              <p className="muted">No member balances available.</p>
            ) : (
              balances.map((balance) => (
                <div className="balance-row" key={balance.memberId}>
                  <span>{balance.name}</span>

                  <strong>
                    {formatMoney(balance.outstandingCents)}
                  </strong>
                </div>
              ))
            )}
          </section>
        </>
      )}

      <footer>
        Shared Bill Splitter · Built with React, TypeScript and Hono
      </footer>
    </main>
  )
}