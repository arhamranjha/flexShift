import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import type SMTPPool from 'nodemailer/lib/smtp-pool';

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
}

/**
 * Outgoing email. Drivers (EMAIL_DRIVER):
 *   off  (default)  nothing is sent
 *   smtp            real delivery through SMTP_URL (e.g. smtps://user:pass@smtp.example.com)
 *   json            builds the message without sending and keeps it in `outbox` (tests, local debugging)
 * Sending is best-effort and never throws into the caller.
 */
@Injectable()
export class MailerService {
  private log = new Logger(MailerService.name);
  private transport?: Transporter;
  readonly driver = (process.env.EMAIL_DRIVER || 'off').toLowerCase();
  private from = process.env.EMAIL_FROM || 'FlexShift <no-reply@flexshift.local>';
  /** Messages produced by the json driver, newest last. */
  readonly outbox: (MailMessage & { from: string })[] = [];

  constructor() {
    if (this.driver === 'smtp') {
      if (!process.env.SMTP_URL) {
        this.log.error('EMAIL_DRIVER=smtp needs SMTP_URL; email is disabled');
      } else {
        // Pooled with explicit timeouts so a slow or dead SMTP server cannot pile up sockets or hang for minutes.
        this.transport = createTransport({
          url: process.env.SMTP_URL,
          pool: true,
          maxConnections: 5,
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
          socketTimeout: 20_000,
        } as SMTPPool.Options);
      }
    } else if (this.driver === 'json') {
      this.transport = createTransport({ jsonTransport: true });
    }
  }

  get enabled() {
    return !!this.transport;
  }

  async send(msg: MailMessage) {
    if (!this.transport) return;
    try {
      await this.transport.sendMail({ from: this.from, ...msg });
      if (this.driver === 'json') this.outbox.push({ from: this.from, ...msg });
    } catch (e) {
      this.log.warn(`email to ${msg.to} failed: ${(e as Error).message}`);
    }
  }
}
