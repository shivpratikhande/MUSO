import { Injectable, Logger } from '@nestjs/common';

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
}

/**
 * Development mailer: logs messages instead of sending them and keeps the last few
 * in memory so e2e tests can read verification codes.
 * TODO(M2+): add an SMTP/provider implementation selected by env.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  readonly outbox: OutgoingMail[] = [];

  async send(mail: OutgoingMail): Promise<void> {
    this.outbox.push(mail);
    if (this.outbox.length > 50) this.outbox.shift();
    this.logger.log(`[dev mail] to=${mail.to} subject="${mail.subject}"\n${mail.text}`);
  }
}
