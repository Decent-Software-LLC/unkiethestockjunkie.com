---
layout: default
title: "Contact Unkie"
permalink: /contact/
---

<section class="page-header">
  <div class="container">
    <h1>📬 Get in Touch</h1>
    <p class="lead">Questions? Suggestions? Just want to say hi? Drop me a line!</p>
  </div>
</section>

<section class="contact-content">
  <div class="container">
    <div class="contact-grid">
      
      <div class="contact-form-section">
        <h2>Send a Message</h2>
        <p>Fill out the form below and I'll get back to you as soon as possible.</p>
        
        <div class="coming-soon-box">
          <h3>🚧 Contact Form Coming Soon</h3>
          <p>We're setting up our contact system. For now, you can reach us via:</p>
          <ul style="margin: 1rem 0; padding-left: 1.5rem;">
            <li>Email: <a href="mailto:hello@unkiethestockjunkie.com">hello@unkiethestockjunkie.com</a></li>
            <li>GitHub: <a href="https://github.com/Decent-Software-LLC/unkiethestockjunkie.com" target="_blank">github.com/Decent-Software-LLC/unkiethestockjunkie.com</a></li>
          </ul>
          <p>We typically respond within 2-3 business days.</p>
        </div>
      </div>
      
      <div class="contact-info-section">
        <div class="info-card">
          <h3>📧 Email</h3>
          <p><a href="mailto:hello@unkiethestockjunkie.com">hello@unkiethestockjunkie.com</a></p>
          <p class="info-note">Best for general questions</p>
        </div>
        
        <div class="info-card">
          <h3>💻 GitHub</h3>
          <p><a href="https://github.com/Decent-Software-LLC/unkiethestockjunkie.com" target="_blank">github.com/Decent-Software-LLC/unkiethestockjunkie.com</a></p>
          <p class="info-note">Open source! Report bugs or contribute</p>
        </div>
        
        <div class="info-card">
          <h3>🐦 Social</h3>
          <div class="social-links">
            <a href="#" aria-label="Twitter">Twitter</a>
            <a href="#" aria-label="YouTube">YouTube</a>
            <a href="#" aria-label="Discord">Discord</a>
          </div>
          <p class="info-note">Coming soon!</p>
        </div>
        
        <div class="info-card faq-cta">
          <h3>❓ Quick Question?</h3>
          <p>Check our <a href="/faq">FAQ page</a> first - your question might already be answered!</p>
        </div>
        
        <div class="info-card response-time">
          <h3>⏰ Response Time</h3>
          <p>I typically respond within 2-3 business days. Thanks for your patience!</p>
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
