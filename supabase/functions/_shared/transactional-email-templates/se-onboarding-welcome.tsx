import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Text, Button, Section, Hr, Link,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'KlikKlaar Sales'
const PLATFORM_URL = 'https://klikklaar-sales-controlpanel.lovable.app'

interface SEOnboardingProps {
  firstName?: string
  lastName?: string
  email?: string
  temporaryPassword?: string
  coachName?: string
  coachEmail?: string
  startDate?: string
  startTime?: string
  productLines?: string[]
}

const SEOnboardingWelcomeEmail = ({
  firstName = 'Huub',
  lastName = 'Rood',
  email = 'huub@voorbeeld.nl',
  temporaryPassword = '(wordt apart gedeeld)',
  coachName = 'Jouw Coach',
  coachEmail = 'coach@klikklaar.nl',
  startDate = 'Maandag',
  startTime = '09:00',
  productLines = ['SEO', 'Web'],
}: SEOnboardingProps) => (
  <Html lang="nl" dir="ltr">
    <Head />
    <Preview>Welkom bij {SITE_NAME} — onboarding {startDate} om {startTime}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brandText}>KlikKlaar</Text>
        </Section>

        <Heading style={h1}>
          Hoi {firstName},
        </Heading>
        <Text style={text}>
          Welkom bij het team. Hieronder vind je alle informatie die je nodig hebt
          om {startDate} goed van start te gaan.
        </Text>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Inloggegevens</Heading>
        <Section style={infoBox}>
          <Text style={infoLabel}>Platform</Text>
          <Link href={PLATFORM_URL} style={infoLink}>{PLATFORM_URL}</Link>

          <Text style={infoLabel}>E-mailadres</Text>
          <Text style={infoValue}>{email}</Text>

          <Text style={infoLabel}>Tijdelijk wachtwoord</Text>
          <Text style={infoValue}>{temporaryPassword}</Text>

          <Text style={smallNote}>
            Wijzig je wachtwoord direct na de eerste inlog via "Wachtwoord vergeten?" op de loginpagina.
          </Text>
        </Section>

        <Button style={primaryButton} href={PLATFORM_URL}>
          Inloggen op het platform
        </Button>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Je begeleider</Heading>
        <Text style={text}>
          Tijdens de onboarding en je eerste weken word je begeleid door {coachName}.
          Neem contact op als je ergens tegenaan loopt.
        </Text>
        <Section style={infoBox}>
          <Text style={infoLabel}>Coach</Text>
          <Text style={infoValue}>{coachName}</Text>

          <Text style={infoLabel}>E-mail</Text>
          <Link href={`mailto:${coachEmail}`} style={infoLink}>{coachEmail}</Link>
        </Section>

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Programma onboarding ochtend</Heading>
        <Text style={text}>
          {startDate} — start om {startTime}
        </Text>
        <Section style={scheduleBox}>
          <Text style={scheduleItem}><strong>{startTime}</strong> — Welkom en kennismaking</Text>
          <Text style={scheduleItem}><strong>{startTime.replace(/\d{2}$/, '30')}</strong> — Platform rondleiding, inlog testen</Text>
          <Text style={scheduleItem}><strong>10:00</strong> — Belscript en productlijnen doorlopen</Text>
          <Text style={scheduleItem}><strong>10:30</strong> — Eerste leads en CRM uitleg</Text>
          <Text style={scheduleItem}><strong>11:00</strong> — Belpraktijk met coach</Text>
          <Text style={scheduleItem}><strong>11:30</strong> — EOD-formulier en dagelijkse routine</Text>
          <Text style={scheduleItem}><strong>12:00</strong> — Vragen en afsluiting</Text>
        </Section>

        {productLines && productLines.length > 0 && (
          <>
            <Hr style={hr} />
            <Heading as="h2" style={h2}>Productlijnen</Heading>
            <Text style={text}>
              Je gaat werken met: <strong>{productLines.join(', ')}</strong>
            </Text>
          </>
        )}

        <Hr style={hr} />

        <Heading as="h2" style={h2}>Handige links</Heading>
        <Section style={linksBox}>
          <Text style={linkItem}>
            <Link href={`${PLATFORM_URL}/dashboard`} style={infoLink}>Dashboard</Link>
          </Text>
          <Text style={linkItem}>
            <Link href={`${PLATFORM_URL}/call-logging`} style={infoLink}>Belregistratie</Link>
          </Text>
          <Text style={linkItem}>
            <Link href={`${PLATFORM_URL}/training`} style={infoLink}>Trainingsmateriaal</Link>
          </Text>
          <Text style={linkItem}>
            <Link href={`${PLATFORM_URL}/eod`} style={infoLink}>EOD Formulier</Link>
          </Text>
        </Section>

        <Hr style={hr} />

        <Text style={footer}>
          Tot {startDate}.
        </Text>
        <Text style={footer}>
          Team KlikKlaar Sales
        </Text>
        <Text style={smallFooter}>
          Vragen? Neem contact op met {coachName} via{' '}
          <Link href={`mailto:${coachEmail}`} style={footerLink}>{coachEmail}</Link>.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: SEOnboardingWelcomeEmail,
  subject: (data: Record<string, any>) =>
    `KlikKlaar Sales — Onboarding informatie ${data.firstName || ''} ${data.lastName || ''}`.trim(),
  displayName: 'SE Onboarding Welkom',
  previewData: {
    firstName: 'Huub',
    lastName: 'Rood',
    email: 'huub.rood@klikklaar.nl',
    temporaryPassword: 'Welkom2026!',
    coachName: 'Jouw Coach',
    coachEmail: 'coach@klikklaar.nl',
    startDate: 'Maandag 31 maart',
    startTime: '09:00',
    productLines: ['SEO', 'Web'],
  },
} satisfies TemplateEntry

/* ── Styles ─────────────────────────────────────────── */

const main = { backgroundColor: '#ffffff', fontFamily: "'Inter', Arial, sans-serif" }
const container = { padding: '32px 28px', maxWidth: '580px', margin: '0 auto' }

const header = {
  backgroundColor: '#0e6b54',
  padding: '20px 28px',
  borderRadius: '12px 12px 0 0',
  marginBottom: '0',
  marginLeft: '-28px',
  marginRight: '-28px',
  marginTop: '-32px',
}

const brandText = {
  color: '#ffffff',
  fontSize: '22px',
  fontWeight: '700' as const,
  letterSpacing: '-0.5px',
  margin: '0',
}

const h1 = {
  fontSize: '24px',
  fontWeight: '700' as const,
  color: '#1a2332',
  margin: '28px 0 12px',
  lineHeight: '1.3',
}

const h2 = {
  fontSize: '17px',
  fontWeight: '600' as const,
  color: '#1a2332',
  margin: '24px 0 10px',
}

const text = {
  fontSize: '14px',
  color: '#4a5568',
  lineHeight: '1.6',
  margin: '0 0 14px',
}

const hr = {
  borderColor: '#e8ecf0',
  margin: '20px 0',
}

const infoBox = {
  backgroundColor: '#f0faf7',
  borderRadius: '8px',
  padding: '16px 18px',
  margin: '10px 0 16px',
  borderLeft: '3px solid #0e6b54',
}

const infoLabel = {
  fontSize: '11px',
  fontWeight: '600' as const,
  color: '#6b7a8d',
  textTransform: 'uppercase' as const,
  letterSpacing: '0.5px',
  margin: '8px 0 2px',
}

const infoValue = {
  fontSize: '14px',
  fontWeight: '500' as const,
  color: '#1a2332',
  margin: '0 0 6px',
}

const infoLink = {
  fontSize: '14px',
  color: '#0e6b54',
  textDecoration: 'underline',
}

const smallNote = {
  fontSize: '12px',
  color: '#c53030',
  margin: '8px 0 0',
}

const primaryButton = {
  backgroundColor: '#0e6b54',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '8px',
  fontSize: '14px',
  fontWeight: '600' as const,
  textDecoration: 'none',
  display: 'inline-block' as const,
  textAlign: 'center' as const,
}

const scheduleBox = {
  backgroundColor: '#f7fafc',
  borderRadius: '8px',
  padding: '14px 18px',
  margin: '10px 0',
}

const scheduleItem = {
  fontSize: '13px',
  color: '#4a5568',
  margin: '6px 0',
  lineHeight: '1.5',
}

const linksBox = {
  padding: '0 4px',
}

const linkItem = {
  fontSize: '14px',
  margin: '6px 0',
}

const footer = {
  fontSize: '14px',
  color: '#1a2332',
  fontWeight: '500' as const,
  margin: '4px 0',
}

const smallFooter = {
  fontSize: '11px',
  color: '#a0aec0',
  margin: '20px 0 0',
  lineHeight: '1.5',
}

const footerLink = {
  fontSize: '11px',
  color: '#0e6b54',
}
