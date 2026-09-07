// Browser-triggerable seed endpoint — lets you initialize/reset the deployed
// database from a URL instead of running `npm run seed` from a terminal.
//
// Visit: https://<your-deployment>.vercel.app/api/seed?secret=<SEED_SECRET>
//
// Guarded by a shared-secret query param (SEED_SECRET env var) rather than
// left wide open, since this wipes and reloads all data — anyone who can
// hit this without one could reset the demo/dev database at will. Set
// SEED_SECRET in Vercel's Environment Variables alongside DATABASE_URL.
const { seedDatabase } = require('../../../db/seed');

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const secret = request.nextUrl.searchParams.get('secret');

  if (!process.env.SEED_SECRET) {
    return Response.json(
      { ok: false, error: 'SEED_SECRET is not set in this deployment\'s environment variables.' },
      { status: 500 }
    );
  }
  if (secret !== process.env.SEED_SECRET) {
    return Response.json({ ok: false, error: 'Missing or incorrect ?secret=' }, { status: 401 });
  }

  try {
    await seedDatabase();
    return Response.json({
      ok: true,
      message: 'Seed complete: 3 SKUs, 7 POs, 30 days of sales history, inventory across US/CA/CN.',
    });
  } catch (err) {
    return Response.json({ ok: false, error: String(err) }, { status: 500 });
  }
}
