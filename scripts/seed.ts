import 'dotenv/config';
import { db } from '../lib/db';
import { businesses } from '../lib/schema';
import { hashPassword } from '../lib/auth';
import { eq } from 'drizzle-orm';

const SERVICE_MAP: Record<string, string> = {
  consulta: 'TM4DP3FZJ2C36QJQQLPDBZ5I',
  'corte de hombre': 'ZYN7YIHAZTTN6KMNFS2J7SCE',
  'corte hombre': 'ZYN7YIHAZTTN6KMNFS2J7SCE',
  'corte caballero': 'ZYN7YIHAZTTN6KMNFS2J7SCE',
  'corte de mujer': 'R3RLFASGF6YGLON7MOQWU3AN',
  'corte mujer': 'R3RLFASGF6YGLON7MOQWU3AN',
  'corte dama': 'R3RLFASGF6YGLON7MOQWU3AN',
  'corte de nino': 'XYKVILW6TE3FP2LWCG4RWIFF',
  'corte nino': 'XYKVILW6TE3FP2LWCG4RWIFF',
  'corte de niño': 'XYKVILW6TE3FP2LWCG4RWIFF',
  'corte niño': 'XYKVILW6TE3FP2LWCG4RWIFF',
  'corte infantil': 'XYKVILW6TE3FP2LWCG4RWIFF',
  rayos: 'F3MVVTTMZX7UWSP7FECGPI43',
  highlights: 'F3MVVTTMZX7UWSP7FECGPI43',
  tinte: 'BYEC7D4FTOKADH7LXXSFG4IH',
  depilacion: 'UCHV5FDAFASUADYY62YUIFW6',
  'depilación': 'UCHV5FDAFASUADYY62YUIFW6',
  'depilacion con cera': 'UCHV5FDAFASUADYY62YUIFW6',
  'depilación con cera': 'UCHV5FDAFASUADYY62YUIFW6',
  cera: 'UCHV5FDAFASUADYY62YUIFW6',
  wax: 'UCHV5FDAFASUADYY62YUIFW6',
  secado: 'CYJPMWAET5VIEBRVAUYY6LQD',
  blowout: 'CYJPMWAET5VIEBRVAUYY6LQD',
  keratina: 'LOJ7KUO7FXHKROPC5K4LXCVD',
  queratina: 'LOJ7KUO7FXHKROPC5K4LXCVD',
  peinado: 'B2QQS427IWXKNKDUBZ3ONFIS',
  permanente: 'PMVB53QSY2HU4F7NGZKHYTM6',
  mua: '3D5QOJ6L7M2QHUTOXEET5ESJ',
  maquillaje: '3D5QOJ6L7M2QHUTOXEET5ESJ',
  makeup: '3D5QOJ6L7M2QHUTOXEET5ESJ',
  tratamiento: 'HDOTTTABEEBSTQRIGX747O22',
  'bano de color': 'DKF4UQ6ZCH5BVALH2Y5OP72C',
  'baño de color': 'DKF4UQ6ZCH5BVALH2Y5OP72C',
  bano: 'DKF4UQ6ZCH5BVALH2Y5OP72C',
  'baño': 'DKF4UQ6ZCH5BVALH2Y5OP72C',
  alaciado: 'KDBIRJYJY7RTJNO44YUYRVCL',
  'alaciado expres': 'KDBIRJYJY7RTJNO44YUYRVCL',
  'alaciado express': 'KDBIRJYJY7RTJNO44YUYRVCL',
  extensiones: 'ZZGPGXOCRK62LFXB3MCUHR2V',
  extenciones: 'ZZGPGXOCRK62LFXB3MCUHR2V',
  extensions: 'ZZGPGXOCRK62LFXB3MCUHR2V',
  balayage: 'NO4BO6PP2LOWG4KFEZFTGJJ7',
  'retoque de raiz': 'W426FALDAVIKJAWJ3CEJTKDH',
  'retoque de raíz': 'W426FALDAVIKJAWJ3CEJTKDH',
  'retoque raiz': 'W426FALDAVIKJAWJ3CEJTKDH',
  'retoque raíz': 'W426FALDAVIKJAWJ3CEJTKDH',
};

async function main() {
  const slug = process.env.SEED_SLUG || 'laras';
  const name = process.env.SEED_NAME || "LARA'S";
  const password = process.env.SEED_PASSWORD;
  const accessToken = process.env.SQUARE_ACCESS_TOKEN;
  const locationId = process.env.SQUARE_LOCATION_ID;
  const teamMemberId = process.env.SQUARE_TEAM_MEMBER_ID;
  const notifyPhone = process.env.SEED_NOTIFY_PHONE;
  const dryRun = process.env.SEED_DRY_RUN || 'true';

  if (!password) throw new Error('SEED_PASSWORD env var required');
  if (!accessToken || !locationId || !teamMemberId) {
    throw new Error('SQUARE_ACCESS_TOKEN, SQUARE_LOCATION_ID, SQUARE_TEAM_MEMBER_ID required');
  }

  const existing = await db.select().from(businesses).where(eq(businesses.slug, slug));
  if (existing[0]) {
    await db
      .update(businesses)
      .set({
        name,
        squareAccessToken: accessToken,
        squareEnvironment: 'production',
        squareLocationId: locationId,
        squareTeamMemberId: teamMemberId,
        serviceMap: SERVICE_MAP,
        ownerPasswordHash: hashPassword(password),
        notifyPhone: notifyPhone ?? null,
        dryRun,
      })
      .where(eq(businesses.slug, slug));
    console.log(`updated business "${slug}"`);
  } else {
    await db.insert(businesses).values({
      slug,
      name,
      squareAccessToken: accessToken,
      squareEnvironment: 'production',
      squareLocationId: locationId,
      squareTeamMemberId: teamMemberId,
      serviceMap: SERVICE_MAP,
      ownerPasswordHash: hashPassword(password),
      notifyPhone: notifyPhone ?? null,
      dryRun,
    });
    console.log(`created business "${slug}"`);
  }
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
