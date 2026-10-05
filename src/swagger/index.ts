import swaggerJsdoc from 'swagger-jsdoc'
import { env } from '../config/env'

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'SAWABA Grooming Studio — REST API',
      version: '1.0.0',
      description:
        'Secure, scalable REST API for the SAWABA Grooming Studio appointment management system. ' +
        'Provides admin authentication, services, barbers, appointments, gallery, reviews, contact messaging and dashboard metrics.',
      contact: {
        name: 'SAWABA Engineering',
        email: 'hello@sawabasalon.com',
      },
    },
    servers: [
      {
        url: `http://localhost:${env.port}`,
        description: 'Local development server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Pass the token returned from POST /api/auth/login.',
        },
      },
    },
    security: [{ bearerAuth: [] }],
    tags: [
      { name: 'Auth', description: 'Admin authentication and profile management.' },
      { name: 'Services', description: 'Barbershop services catalog.' },
      { name: 'Barbers', description: 'Barber profiles, services offered and availability.' },
      { name: 'Availability', description: 'Public time-slot availability lookups.' },
      { name: 'Appointments', description: 'Appointment booking and management.' },
      { name: 'Gallery', description: 'Portfolio gallery image management.' },
      { name: 'Reviews', description: 'Customer review submissions and admin moderation.' },
      { name: 'Contact', description: 'Contact message submissions and admin inbox.' },
      { name: 'Admin', description: 'Admin dashboard and customer list.' },
    ],
  },
  apis: ['./src/routes/*.ts', './src/swagger/*.ts'],
}

export const swaggerSpec = swaggerJsdoc(options)