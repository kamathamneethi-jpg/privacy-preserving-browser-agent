/**
 * Privacy-Safe Synthetic Evaluation Dataset & Test Fixtures (Step 17).
 * Provides strictly synthetic test data for automated evaluation and SIH demonstration.
 *
 * PRIVACY GUARANTEE:
 * Contains ZERO real personal information, user accounts, live API keys, or production credentials.
 * Uses .invalid domains for synthetic email addresses to ensure zero accidental network transmission.
 */

export const SYNTHETIC_EVAL_DATASET = Object.freeze({
  emails: Object.freeze([
    "test@example.invalid",
    "john.doe@sample.invalid",
    "alice.smith@demo.invalid"
  ]),

  phones: Object.freeze([
    "+15550199999",
    "555-0142",
    "+919876543210"
  ]),

  passwords: Object.freeze([
    "synthetic-password-123",
    "DemoSecretPass!99",
    "TestVaultSecret#2026"
  ]),

  creditCards: Object.freeze([
    "4532012345678910", // Synthetic Visa (Luhn valid)
    "0000000000000000"
  ]),

  otps: Object.freeze([
    "TEST-OTP-9988",
    "123456",
    "998877"
  ]),

  scenarios: Object.freeze({
    nonSensitiveSearch: Object.freeze({
      userTask: "Search for lightweight laptops online",
      taskIntent: "PRODUCT_SEARCH",
      pageState: Object.freeze({
        url: "https://shop.example.invalid/search",
        text: "Browse latest lightweight laptop models under $1000",
        domTree: Object.freeze({
          tagName: "div",
          children: [
            Object.freeze({ id: "search_box", tagName: "input", attributes: Object.freeze({ type: "text" }) }),
            Object.freeze({ id: "search_btn", tagName: "button", attributes: Object.freeze({ type: "submit" }) })
          ]
        }),
        nodes: Object.freeze([
          Object.freeze({ id: "search_btn", tagName: "button" })
        ])
      })
    }),

    sensitiveFormFill: Object.freeze({
      userTask: "Fill payment form using stored vault card details",
      taskIntent: "FORM_SUBMIT",
      pageState: Object.freeze({
        url: "https://checkout.example.invalid/pay",
        text: "Please enter your card number 4532 0123 4567 8910 and billing email test@example.invalid",
        domTree: Object.freeze({
          tagName: "form",
          children: [
            Object.freeze({ id: "email_input", tagName: "input", attributes: Object.freeze({ type: "email" }) }),
            Object.freeze({ id: "card_input", tagName: "input", attributes: Object.freeze({ type: "password" }) }),
            Object.freeze({ id: "pay_btn", tagName: "button", attributes: Object.freeze({ type: "submit" }) })
          ]
        }),
        nodes: Object.freeze([
          Object.freeze({ id: "pay_btn", tagName: "button" })
        ]),
        vaultSecret: Object.freeze({
          id: "secret_card_123",
          category: "CREDIT_CARD",
          value: "4532012345678910",
          purpose: "LOCAL_ACTION"
        })
      })
    }),

    maliciousScriptPage: Object.freeze({
      userTask: "Navigate user account dashboard",
      taskIntent: "ACCOUNT_VIEW",
      pageState: Object.freeze({
        url: "https://suspicious.example.invalid/hack",
        text: "<script>eval('alert(1)')</script> Click javascript:void(0) to proceed",
        domTree: Object.freeze({
          tagName: "div",
          children: [
            Object.freeze({ id: "hack_link", tagName: "a", attributes: Object.freeze({ href: "javascript:eval(1)" }) })
          ]
        }),
        nodes: Object.freeze([
          Object.freeze({ id: "hack_link", tagName: "a" })
        ])
      })
    })
  })
});
