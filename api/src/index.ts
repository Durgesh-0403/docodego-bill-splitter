import { Hono } from 'hono'


type AppEnv = {
  Bindings: Env
}

type HomeRow = {
  id: string
  name: string
}

type MemberRow = {
  id: string
  home_id: string
  name: string
}

type BillRow = {
  id: string
  home_id: string
  title: string
  total_cents: number
}

type ShareRow = {
  id: string
  bill_id: string
  member_id: string
  amount_cents: number
  paid_at: string | null
  idempotency_key: string | null
}

type UserBody = {
  name: string
}

type BillBody = {
  title: string
  totalCents: number
}

const app = new Hono<AppEnv>()

// Helper: safely read JSON
async function readBody(c: {
  req: {
    json: () => Promise<unknown>
  }
}): Promise<unknown> {
  try {
    return await c.req.json()
  } catch {
    return null
  }
}

// Helper: validate a non-empty name
function validName(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

// Health API
app.get('/api/health', (c) => {
  return c.json({ status: 'ok' })
})

// --------------------------------------------------
// 1. CREATE HOME
// --------------------------------------------------

app.post('/api/homes', async (c) => {
  const body: unknown = await readBody(c)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    !validName(body.name)
  ) {
    return c.json({ error: 'Valid home name is required' }, 422)
  }

  const name = body.name.trim()
  const id = crypto.randomUUID()

  await c.env.DB.prepare(
    'INSERT INTO homes (id, name) VALUES (?, ?)',
  )
    .bind(id, name)
    .run()

  return c.json({ id, name }, 201)
})

// --------------------------------------------------
// 2. ADD MEMBER
// --------------------------------------------------

app.post('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')
  const body: unknown = await readBody(c)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('name' in body) ||
    !validName(body.name)
  ) {
    return c.json({ error: 'Valid member name is required' }, 422)
  }

  const home = await c.env.DB.prepare(
    'SELECT id FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const id = crypto.randomUUID()
  const name = body.name.trim()

  await c.env.DB.prepare(
    'INSERT INTO members (id, home_id, name) VALUES (?, ?, ?)',
  )
    .bind(id, homeId, name)
    .run()

  return c.json({ id, homeId, name }, 201)
})

// --------------------------------------------------
// 3. GET MEMBERS (FOR FRONTEND)
// --------------------------------------------------

app.get('/api/homes/:homeId/members', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare(
    'SELECT id FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    'SELECT id, home_id, name FROM members WHERE home_id = ? ORDER BY rowid',
  )
    .bind(homeId)
    .all<MemberRow>()

  return c.json({
    members: result.results.map((member) => ({
      id: member.id,
      homeId: member.home_id,
      name: member.name,
    })),
  })
})

// --------------------------------------------------
// 4. CREATE BILL AND SPLIT
// --------------------------------------------------

app.post('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')
  const body: unknown = await readBody(c)

  if (
    typeof body !== 'object' ||
    body === null ||
    !('title' in body) ||
    !('totalCents' in body) ||
    !validName(body.title) ||
    typeof body.totalCents !== 'number' ||
    !Number.isSafeInteger(body.totalCents) ||
    body.totalCents <= 0
  ) {
    return c.json({ error: 'Invalid bill details' }, 422)
  }

  const title = body.title.trim()
  const totalCents = body.totalCents

  const home = await c.env.DB.prepare(
    'SELECT id FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const membersResult = await c.env.DB.prepare(
    'SELECT id FROM members WHERE home_id = ? ORDER BY rowid',
  )
    .bind(homeId)
    .all<{ id: string }>()

  const members = membersResult.results

  if (members.length === 0) {
    return c.json({ error: 'Home has no members' }, 422)
  }

  const billId = crypto.randomUUID()

  const base = Math.floor(totalCents / members.length)
  const remainder = totalCents % members.length

  const shares = members.map((member, index) => ({
    id: crypto.randomUUID(),
    memberId: member.id,
    amountCents: base + (index < remainder ? 1 : 0),
    paidAt: null as string | null,
  }))

  // Create bill and all shares in one D1 batch.
  const statements = [
    c.env.DB.prepare(
      'INSERT INTO bills (id, home_id, title, total_cents) VALUES (?, ?, ?, ?)',
    ).bind(billId, homeId, title, totalCents),

    ...shares.map((share) =>
      c.env.DB.prepare(
        `INSERT INTO shares
         (id, bill_id, member_id, amount_cents)
         VALUES (?, ?, ?, ?)`,
      ).bind(
        share.id,
        billId,
        share.memberId,
        share.amountCents,
      ),
    ),
  ]

  await c.env.DB.batch(statements)

  return c.json(
    {
      id: billId,
      homeId,
      title,
      totalCents,
      shares,
    },
    201,
  )
})

// --------------------------------------------------
// 5. GET BILLS (FOR FRONTEND)
// --------------------------------------------------

app.get('/api/homes/:homeId/bills', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare(
    'SELECT id FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const billsResult = await c.env.DB.prepare(
    'SELECT id, home_id, title, total_cents FROM bills WHERE home_id = ? ORDER BY rowid DESC',
  )
    .bind(homeId)
    .all<BillRow>()

  const bills = await Promise.all(
    billsResult.results.map(async (bill) => {
      const sharesResult = await c.env.DB.prepare(
        `SELECT id, bill_id, member_id, amount_cents,
                paid_at, idempotency_key
         FROM shares
         WHERE bill_id = ?
         ORDER BY rowid`,
      )
        .bind(bill.id)
        .all<ShareRow>()

      return {
        id: bill.id,
        homeId: bill.home_id,
        title: bill.title,
        totalCents: bill.total_cents,
        shares: sharesResult.results.map((share) => ({
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        })),
      }
    }),
  )

  return c.json({ bills })
})

// --------------------------------------------------
// 6. PAY SHARE
// --------------------------------------------------

app.post(
  '/api/bills/:billId/shares/:shareId/pay',
  async (c) => {
    const billId = c.req.param('billId')
    const shareId = c.req.param('shareId')

    const key = c.req.header('Idempotency-Key')

    if (!key || !key.trim()) {
      return c.json(
        { error: 'Idempotency-Key header is required' },
        400,
      )
    }

    const bill = await c.env.DB.prepare(
      'SELECT id FROM bills WHERE id = ?',
    )
      .bind(billId)
      .first<BillRow>()

    if (!bill) {
      return c.json({ error: 'Bill not found' }, 404)
    }

    const share = await c.env.DB.prepare(
      `SELECT id, bill_id, member_id, amount_cents,
              paid_at, idempotency_key
       FROM shares
       WHERE id = ? AND bill_id = ?`,
    )
      .bind(shareId, billId)
      .first<ShareRow>()

    if (!share) {
      return c.json({ error: 'Share not found' }, 404)
    }

    // Same key: return the original successful payment.
    if (share.paid_at !== null) {
      if (share.idempotency_key === key) {
        return c.json({
          id: share.id,
          memberId: share.member_id,
          amountCents: share.amount_cents,
          paidAt: share.paid_at,
        })
      }

      return c.json(
        { error: 'Share already paid' },
        409,
      )
    }

    const paidAt = new Date().toISOString()

    // Atomic conditional update:
    // Only one request can change an unpaid share.
    const result = await c.env.DB.prepare(
      `UPDATE shares
       SET paid_at = ?, idempotency_key = ?
       WHERE id = ?
         AND bill_id = ?
         AND paid_at IS NULL`,
    )
      .bind(paidAt, key, shareId, billId)
      .run()

    const updated = await c.env.DB.prepare(
      `SELECT id, member_id, amount_cents,
              paid_at, idempotency_key
       FROM shares
       WHERE id = ? AND bill_id = ?`,
    )
      .bind(shareId, billId)
      .first<ShareRow>()

    if (!updated || updated.paid_at === null) {
      return c.json({ error: 'Payment failed' }, 409)
    }

    // If another request won the race, check its key.
    if (result.meta.changes === 0) {
      if (updated.idempotency_key !== key) {
        return c.json(
          { error: 'Share already paid' },
          409,
        )
      }
    }

    return c.json({
      id: updated.id,
      memberId: updated.member_id,
      amountCents: updated.amount_cents,
      paidAt: updated.paid_at,
    })
  },
)

// --------------------------------------------------
// 7. GET HOME BALANCES
// --------------------------------------------------

app.get('/api/homes/:homeId/balances', async (c) => {
  const homeId = c.req.param('homeId')

  const home = await c.env.DB.prepare(
    'SELECT id FROM homes WHERE id = ?',
  )
    .bind(homeId)
    .first<HomeRow>()

  if (!home) {
    return c.json({ error: 'Home not found' }, 404)
  }

  const result = await c.env.DB.prepare(
    `SELECT
       m.id AS member_id,
       m.name AS name,
       COALESCE(
         SUM(
           CASE
             WHEN s.paid_at IS NULL
             THEN s.amount_cents
             ELSE 0
           END
         ), 0
       ) AS outstanding_cents

     FROM members m

     LEFT JOIN bills b
       ON b.home_id = m.home_id

     LEFT JOIN shares s
       ON s.bill_id = b.id
       AND s.member_id = m.id

     WHERE m.home_id = ?

     GROUP BY m.id, m.name

     ORDER BY m.rowid`,
  )
    .bind(homeId)
    .all<{
      member_id: string
      name: string
      outstanding_cents: number
    }>()

  return c.json({
    balances: result.results.map((row) => ({
      memberId: row.member_id,
      name: row.name,
      outstandingCents: row.outstanding_cents,
    })),
  })
})

// Handle unexpected server errors.
app.onError((err, c) => {
  console.error('API Error:', err)

  return c.json(
    { error: 'Internal server error' },
    500,
  )
})

// Handle invalid API routes.
app.notFound((c) => {
  return c.json(
    { error: 'API route not found' },
    404,
  )
})

export default app
