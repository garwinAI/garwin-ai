// Transactional email content. Plain text first (always readable), simple HTML second.
// All user-supplied values are HTML-escaped.

export type EmailMessage = { to: string; subject: string; text: string; html: string; tag: EmailTag };
export type EmailTag = "verify_email" | "password_reset" | "password_changed" | "team_invite";

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function layout(title: string, bodyHtml: string) {
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;color:#171717">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border:1px solid #e5e5e5;border-radius:12px" cellpadding="0" cellspacing="0">
<tr><td style="padding:28px 28px 8px;font-size:16px;font-weight:600">Garwin <span style="color:#c2410c">AI</span></td></tr>
<tr><td style="padding:8px 28px 28px;font-size:15px;line-height:1.55">
<h1 style="font-size:20px;margin:0 0 12px">${escapeHtml(title)}</h1>
${bodyHtml}
</td></tr></table>
<p style="font-size:12px;color:#6b6b6b;margin-top:16px">You received this email because of activity on your Garwin AI account.</p>
</td></tr></table></body></html>`;
}

function button(url: string, label: string) {
  return `<p style="margin:24px 0"><a href="${escapeHtml(url)}" style="background:#2563eb;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;display:inline-block;font-weight:600">${escapeHtml(label)}</a></p>
<p style="font-size:13px;color:#6b6b6b;word-break:break-all">Or paste this link into your browser:<br>${escapeHtml(url)}</p>`;
}

export function verifyEmailMessage(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    tag: "verify_email",
    subject: "Verify your email for Garwin AI",
    text: `Hi ${name},\n\nConfirm your email address for Garwin AI:\n${url}\n\nThis link expires in 24 hours. If you didn't create an account, you can ignore this email.`,
    html: layout(
      "Verify your email",
      `<p>Hi ${escapeHtml(name)},</p><p>Confirm this is your email address to finish setting up Garwin AI.</p>${button(url, "Verify email")}<p style="font-size:13px;color:#6b6b6b">This link expires in 24 hours. If you didn't create an account, you can ignore this email.</p>`,
    ),
  };
}

export function passwordResetMessage(to: string, name: string, url: string): EmailMessage {
  return {
    to,
    tag: "password_reset",
    subject: "Reset your Garwin AI password",
    text: `Hi ${name},\n\nSomeone asked to reset the password for your Garwin AI account. To choose a new password, open:\n${url}\n\nThis link expires in 30 minutes and works once. If you didn't ask for this, ignore this email; your password won't change.`,
    html: layout(
      "Reset your password",
      `<p>Hi ${escapeHtml(name)},</p><p>Someone asked to reset the password for your Garwin AI account.</p>${button(url, "Choose a new password")}<p style="font-size:13px;color:#6b6b6b">This link expires in 30 minutes and works once. If you didn't ask for this, ignore this email; your password won't change.</p>`,
    ),
  };
}

export function passwordChangedMessage(to: string, name: string, when: Date, ip: string | null, settingsUrl: string): EmailMessage {
  const whenText = when.toUTCString();
  const from = ip ? ` from IP ${ip}` : "";
  return {
    to,
    tag: "password_changed",
    subject: "Your Garwin AI password was changed",
    text: `Hi ${name},\n\nYour Garwin AI password was changed on ${whenText}${from}. All other devices were signed out.\n\nIf this wasn't you, reset your password right away and review your account: ${settingsUrl}`,
    html: layout(
      "Your password was changed",
      `<p>Hi ${escapeHtml(name)},</p><p>Your Garwin AI password was changed on ${escapeHtml(whenText)}${escapeHtml(from)}. All other devices were signed out.</p><p>If this wasn't you, reset your password right away and review your account security.</p>${button(settingsUrl, "Review security")}`,
    ),
  };
}

export function teamInviteMessage(to: string, hostName: string, workspaceName: string, url: string): EmailMessage {
  return {
    to,
    tag: "team_invite",
    subject: `${hostName} invited you to their Garwin AI team`,
    text: `${hostName} invited you to join "${workspaceName}" on Garwin AI.\n\nAccept the invitation:\n${url}\n\nThis link expires in 7 days and works once. If you weren't expecting this, you can ignore it.`,
    html: layout(
      "You're invited to a team",
      `<p><strong>${escapeHtml(hostName)}</strong> invited you to join <strong>${escapeHtml(workspaceName)}</strong> on Garwin AI.</p>${button(url, "Accept invitation")}<p style="font-size:13px;color:#6b6b6b">This link expires in 7 days and works once. If you weren't expecting this, you can ignore it.</p>`,
    ),
  };
}
