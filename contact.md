---
layout: default
title: "Contact Unkie"
permalink: /contact/
---

<section class="page-header">
  <div class="container">
    <h1>📬 Get in Touch</h1>
    <p class="lead">One person reads this inbox. Corrections, topic requests and "you have this wrong" messages all land in the same place.</p>
  </div>
</section>

<section class="contact-content">
  <div class="container">
    <div class="contact-grid">
      
      <div class="contact-form-section">
        <h2>Email is the only channel</h2>
        <p><a href="mailto:hello@unkiethestockjunkie.com">hello@unkiethestockjunkie.com</a></p>
        <p>This site is static files served by GitHub Pages, so there is no form widget here and none is planned -- a form that posts nowhere would be worse than no form at all. Mail goes straight to whoever maintains the repository. No ticketing queue, no auto-reply pretending somebody is on duty.</p>

        <div class="coming-soon-box">
          <h3>What gets a reply</h3>
          <ul style="margin: 1rem 0; padding-left: 1.5rem;">
            <li>A factual correction, ideally naming the source you checked it against</li>
            <li>A topic request, especially something you could not find explained plainly anywhere</li>
            <li>A broken link, missing image or page that renders badly on your device</li>
            <li>A question about how something works in general terms</li>
          </ul>
        </div>

        <div class="coming-soon-box">
          <h3>What does not</h3>
          <ul style="margin: 1rem 0; padding-left: 1.5rem;">
            <li>"Should I buy this right now?" or "when do I get out?"</li>
            <li>Portfolio reviews, or a verdict on a purchase you already made</li>
            <li>Brokerage logins, deposits, withdrawals, settlement or account errors</li>
            <li>Tax or legal specifics about your own situation</li>
          </ul>
          <p>Not because some policy page forbids it. An answer worth acting on requires a licence, your complete circumstances and someone obliged to act in your interest. A reply from this mailbox has none of the three, so treat anything I write back as an explanation of mechanics and never as a recommendation.</p>
        </div>

        <div class="coming-soon-box">
          <h3>Before you hit send</h3>
          <p>Leave out anything you would not want parked in somebody's mailbox years from now: brokerage screenshots, account or username fragments, government ID numbers, your home address, your school. A first name or a handle is plenty. And if money belonging to you or your family has moved somewhere nobody agreed to, the move that helps is telling a parent, guardian or another trusted adult today -- not emailing a website about it.</p>
        </div>
      </div>

      <div class="contact-info-section">
        <div class="info-card">
          <h3>⏰ When to expect word</h3>
          <p>Usually a few days. Longer when a question means going back to the original filing before answering, which is the kind of reply worth waiting for. Nothing comes back after a week? Resend it -- forwarding a domain mailbox to a human can fail quietly on either end.</p>
        </div>

        <div class="info-card">
          <h3>💻 GitHub</h3>
          <p><a href="https://github.com/Decent-Software-LLC/unkiethestockjunkie.com" target="_blank">Open an issue on the repository</a></p>
          <p class="info-note">Every page here is written in the open, including the checks that gate publication</p>
        </div>

        <div class="info-card">
          <h3>📖 Reading instead</h3>
          <p><a href="{{ '/articles' | relative_url }}">The article library</a> -- plain language, each page ending in questions you should be able to answer.</p>
          <p class="info-note">No social accounts exist. If that changes, it will be stated here first.</p>
        </div>

        <div class="info-card faq-cta">
          <h3>❓ Quick Question?</h3>
          <p>The <a href="{{ '/faq' | relative_url }}">FAQ</a> covers what this site is, who wrote it, and what it refuses to do.</p>
        </div>
      </div>
      
    </div>
  </div>
</section>

<style>
.page-header {
  background: linear-gradient(135deg, var(--bg-secondary) 0%, var(--bg-primary) 100%);
  padding: var(--spacing-3xl) 0;
  text-align: center;
}

.page-header h1 {
  font-size: 3rem;
  margin-bottom: var(--spacing-md);
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-secondary) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}

.lead {
  font-size: 1.25rem;
  color: var(--text-secondary);
}

.contact-content {
  padding: var(--spacing-3xl) 0;
}

.contact-grid {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: var(--spacing-3xl);
}

.contact-form-section h2 {
  margin-bottom: var(--spacing-md);
}

.contact-form-section > p {
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xl);
}

.contact-form {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-xl);
}

.form-group {
  margin-bottom: var(--spacing-lg);
}

.form-group label {
  display: block;
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
  color: var(--text-primary);
}

.form-group input,
.form-group select,
.form-group textarea {
  width: 100%;
  padding: 0.75rem 1rem;
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius);
  font-family: var(--font-sans);
  font-size: 1rem;
  background: var(--bg-primary);
  color: var(--text-primary);
  transition: border-color var(--transition-fast);
}

.form-group input:focus,
.form-group select:focus,
.form-group textarea:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-group small {
  display: block;
  margin-top: var(--spacing-xs);
  font-size: 0.75rem;
  color: var(--text-muted);
}

.checkbox-label {
  display: flex !important;
  align-items: center;
  gap: var(--spacing-sm);
  font-weight: 400 !important;
  cursor: pointer;
}

.checkbox-label input[type="checkbox"] {
  width: auto;
  margin: 0;
}

.form-note {
  margin-top: var(--spacing-xl);
  padding: var(--spacing-lg);
  background: var(--bg-tertiary);
  border-radius: var(--border-radius);
  font-size: 0.875rem;
}

.form-note code {
  background: var(--bg-primary);
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
  font-family: var(--font-mono);
}

.contact-info-section {
  display: flex;
  flex-direction: column;
  gap: var(--spacing-lg);
}

.info-card {
  background: var(--bg-card);
  border: 1px solid var(--border-color);
  border-radius: var(--border-radius-lg);
  padding: var(--spacing-lg);
}

.info-card h3 {
  font-size: 1.125rem;
  margin-bottom: var(--spacing-sm);
}

.info-card p {
  margin-bottom: var(--spacing-xs);
}

.info-note {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: var(--spacing-sm);
}

.social-links {
  display: flex;
  gap: var(--spacing-md);
  margin-top: var(--spacing-sm);
}

.social-links a {
  font-weight: 600;
}

.faq-cta {
  background: linear-gradient(135deg, var(--color-primary) 0%, var(--color-primary-dark) 100%);
  color: white;
}

.faq-cta a {
  color: white;
  text-decoration: underline;
}

.response-time {
  background: var(--bg-secondary);
}

@media (max-width: 1024px) {
  .contact-grid {
    grid-template-columns: 1fr;
  }
  
  .contact-info-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  }
}

@media (max-width: 768px) {
  .page-header h1 {
    font-size: 2rem;
  }
}
</style>
