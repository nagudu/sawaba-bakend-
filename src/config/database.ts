import { Sequelize } from 'sequelize'
import { env } from './env'

export const sequelize = new Sequelize(env.databaseUrl, {
  dialect: 'mysql',
  logging: env.nodeEnv === 'development' ? console.log : false,
  define: {
    underscored: true,
    freezeTableName: false,
    charset: 'utf8mb4',
  },
  // Hosted MySQL providers (Aiven, PlanetScale, Railway, etc.) terminate TLS.
  // Set DB_SSL=true in the deployed environment; local MySQL stays non-SSL.
  // Providers whose CA chain isn't publicly trusted (e.g. Railway) can relax
  // verification with DB_SSL_REJECT_UNAUTHORIZED=false — traffic stays encrypted.
  dialectOptions:
    process.env.DB_SSL === 'true'
      ? { ssl: { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } }
      : undefined,
  pool: {
    max: 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
})

export async function connectDatabase(): Promise<void> {
  await sequelize.authenticate()
}

export async function closeDatabase(): Promise<void> {
  await sequelize.close()
}