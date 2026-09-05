import { DEFAULT_LOCALE, type Locale } from "./locale.js";

/**
 * Customer-facing message catalog.
 *
 * English is the source of truth for the key set; the Greek catalog is typed
 * as a complete record so that a missing translation fails `typecheck`
 * instead of silently leaking English into the Greek experience.
 *
 * Brand and product names (VELYQ, EDGE, RADAR, Match Intelligence) are never
 * translated. Greek uses the informal singular register throughout, matching
 * the tone of Greek consumer sports products.
 *
 * Compliance-sensitive strings — every disclosure that VELYQ makes no
 * guarantee, observes no money flow and executes no wagers — must keep their
 * full negation in both languages. They are marked COMPLIANCE below and
 * should not be shortened without review.
 */
export const messages = {
  // ---------------------------------------------------------------- brand
  brandTagline: "Intelligence platform",
  productMatchIntelligence: "Match Intelligence",
  productMatchIntelligenceSubtitle: "Full match analysis",

  // ----------------------------------------------------------- navigation
  navToday: "Today",
  navEdge: "EDGE",
  navRadar: "RADAR",
  navMatchIntelligence: "Match Intelligence",
  navAccount: "Account",
  navPricing: "Pricing",
  navPlatform: "Platform",
  navResponsibleUse: "Responsible use",
  navPrimaryLabel: "Primary navigation",
  navSkipToContent: "Skip to main content",
  navSectionIntelligence: "Intelligence",
  adminConsole: "Admin console",
  signOut: "Sign out",
  sessionActive: "Session active",
  languageSelector: "Language",
  languageSelectorHint: "Choose your language",

  // --------------------------------------------------------------- shared
  syntheticData: "Synthetic data",
  developmentHeuristic: "Development heuristic",
  experimental: "Experimental",
  observableOnly: "Observable evidence only",
  traceable: "Traceable",
  noEvidence: "No evidence",
  radarMove: "Movement observed",
  viewAll: "View all",
  openMatchIntelligence: "Open Match Intelligence",
  backToSignIn: "Back to sign in",
  syntheticEnvironment: "Synthetic beta environment",
  researchUse: "Experimental · research use",

  // ------------------------------------------------------------- metadata
  metaTitle: "VELYQ — Sports Market Intelligence",
  metaDescription:
    "Traceable sports market intelligence: model probability against live prices, observed odds movement and a full trace behind every number.",

  // ------------------------------------------------------- system states
  customerUnavailable: "Data is not available right now.",
  customerUnavailableBody:
    "The intelligence service did not respond. Nothing is wrong with your account — please try again in a moment.",
  customerLoading: "Loading your intelligence…",
  dataUnavailable: "There is nothing to show yet.",
  dataUnavailableBody:
    "No intelligence has been produced for this period. New observations appear here as soon as they are collected.",
  matchNotFound: "Match not found.",
  matchNotFoundBody:
    "This match is no longer in the current intelligence window, or the link is incorrect.",
  retry: "Try again",
  backToToday: "Back to Today",

  // ----------------------------------------------------------- home: nav
  homeSignIn: "Sign in",
  homeCreateAccount: "Create account",

  // ---------------------------------------------------------- home: hero
  homeHeroEyebrow: "Synthetic beta · Experimental model",
  homeHeroTitleLead: "See the signal",
  homeHeroTitleAccent: "before the noise.",
  homeHeroBody:
    "VELYQ compares what our model believes with what the market is charging — so you can tell a genuinely mispriced outcome apart from ordinary movement.",
  homeHeroPrimaryCta: "Create a free account",
  homeHeroSecondaryCta: "Sign in",
  homeHeroPricingCta: "See plans",
  homeTrustEvidence: "Evidence you can inspect",
  homeTrustNoClaims: "No guaranteed outcomes",
  homeTrustBilingual: "Greek and English",

  // ------------------------------------------------- home: product visual
  homePreviewLabel: "Product preview · synthetic data",
  homePreviewEdge: "Probability edge",
  homePreviewModel: "Model",
  homePreviewMarket: "Market",
  homePreviewRadar: "Market movement",
  homePreviewQuality: "Quality",
  homePreviewOpening: "Open",
  homePreviewCurrent: "Now",
  homePreviewTracked: "Tracked today",

  // ---------------------------------------------------- home: value props
  homeValueEyebrow: "One workspace",
  homeValueTitle: "From market movement to meaningful context.",
  homeValueBody:
    "Every view keeps probability, value, evidence, freshness and recommendation state separate — so the story stays honest and you always know what a number is built on.",
  homeValueOneTitle: "Probability is not value",
  homeValueOneBody:
    "A likely outcome and a well-priced outcome are different things. VELYQ shows both, side by side.",
  homeValueTwoTitle: "Every number has a source",
  homeValueTwoBody:
    "Model version, calibration, quality grade and feature cutoff travel with every recommendation.",
  homeValueThreeTitle: "Silence is a valid answer",
  homeValueThreeBody:
    "When the evidence is thin, VELYQ says so instead of manufacturing a signal.",

  // --------------------------------------------------------- home: modules
  homeModulesEyebrow: "Three modules, one picture",
  homeModulesTitle: "What you get inside.",
  homeEdgeLabel: "01 / EDGE",
  homeEdgeTitle: "Value, with context.",
  homeEdgeBody:
    "EDGE puts our model's probability next to the probability the price implies. If the model says 60% and the price of 1.85 implies 54%, that six-point gap is the edge — shown with fair odds and expected value, never without its assumptions.",
  homeEdgePoint1: "Model probability vs implied probability",
  homeEdgePoint2: "Fair odds and expected value",
  homeEdgePoint3: "A quality grade on every row",
  homeRadarLabel: "02 / RADAR",
  homeRadarTitle: "Movement, observed.",
  homeRadarBody:
    "RADAR records where a price opened, where it is now, and how recently that was seen — so you can tell a market that has genuinely moved from one that simply has not been checked.",
  homeRadarPoint1: "Opening price to current price",
  homeRadarPoint2: "Direction and size of the move",
  homeRadarPoint3: "Freshness on every observation",
  homeMatchLabel: "03 / MATCH INTELLIGENCE",
  homeMatchTitle: "The full picture.",
  homeMatchBody:
    "One page per match that answers the verdict first and shows its work underneath: recommendation and reason, model against market, movement evidence, data quality, lineup state and the complete model trace.",
  homeMatchPoint1: "The verdict, with its reason attached",
  homeMatchPoint2: "Quality and lineup gates made visible",
  homeMatchPoint3: "A complete, auditable model trace",

  // ------------------------------------------------------ home: how it works
  homeHowEyebrow: "How it works",
  homeHowTitle: "Four steps, no black box.",
  homeHowOneTitle: "Observe",
  homeHowOneBody:
    "Market prices are recorded as immutable observations, each with a timestamp and a source.",
  homeHowTwoTitle: "Grade the evidence",
  homeHowTwoBody:
    "Every match is graded A to F. Out-of-date prices, missing lineups and weak market matching are flagged, not hidden.",
  homeHowThreeTitle: "Estimate",
  homeHowThreeBody:
    "An experimental model produces a probability, which becomes fair odds and an expected value you can compare against the market.",
  homeHowFourTitle: "Recommend, or wait",
  homeHowFourBody:
    "A recommendation is issued only when the quality gate passes. Otherwise VELYQ tells you exactly what is missing.",

  // ---------------------------------------------------------- home: why
  homeWhyEyebrow: "Why VELYQ",
  homeWhyTitle: "Built for people who want to be right, not lucky.",
  homeWhyOneTitle: "Honest about uncertainty",
  homeWhyOneBody:
    "No guarantees and no sure things. Confidence is expressed as evidence and a grade, never as hype.",
  homeWhyTwoTitle: "Traceable by design",
  homeWhyTwoBody:
    "Every figure carries its model version, calibration and cutoff, so you can audit any decision long after you made it.",
  homeWhyThreeTitle: "Fast to read",
  homeWhyThreeBody:
    "Today answers one question before anything else: what actually deserves your attention right now?",
  homeWhyFourTitle: "Greek and English",
  homeWhyFourBody:
    "The whole product in both languages, one click apart — including every explanation and every disclosure.",

  // ------------------------------------------------------ home: pricing preview
  homePricingEyebrow: "Plans",
  homePricingTitle: "Start free. Upgrade when it earns it.",
  homePricingBody:
    "Plans control customer features only. They never grant administrative access.",
  homePricingCta: "Compare all plans",

  // --------------------------------------------------------- home: notice
  // COMPLIANCE
  homeNoticeTitle: "About this beta",
  homeNoticeBody:
    "Phase 1 runs on synthetic data and an experimental model. EDGE and RADAR are development heuristics, not validated betting models. VELYQ is an analysis tool for research and information — it does not provide financial advice, does not guarantee any outcome and does not place wagers. Never stake money you cannot afford to lose.",
  homeNoticeLink: "Read the responsible-use notice",

  // ------------------------------------------------------ home: final cta
  homeFinalEyebrow: "Start with the signal",
  homeFinalTitle: "Build a calmer analysis habit.",
  homeFinalBody:
    "Free access is open now — the full Today command centre, EDGE and RADAR, in Greek or English.",
  homeFinalCta: "Create your free account",

  // -------------------------------------------------------- home: footer
  footerRights: "AI sports market intelligence",
  footerCreatedBy: "Created by",
  footerTerms: "Terms",
  footerPrivacy: "Privacy",
  footerResponsibleUse: "Responsible use",
  footerSubscriptionTerms: "Subscription terms",

  // -------------------------------------------------------------- pricing
  pricingKicker: "Plans",
  pricingTitle: "Choose your intelligence access.",
  pricingBody:
    "Plans control customer features only. They never grant administrative access — administrator permissions are held separately and resolved server-side.",
  pricingPerMonth: "per month",
  pricingFreeWhileBeta: "Free during the beta",
  pricingIntroductory: "Introductory price",
  pricingMostPopular: "Most popular",
  pricingCurrentPlan: "Your current plan",
  pricingBillingPending: "Billing activation pending",
  pricingBillingPendingHint:
    "Checkout opens once billing is configured. Nothing is charged today.",
  pricingStartCheckout: "Continue to checkout",
  pricingIncluded: "What is included",
  pricingLimits: "Good to know",
  pricingNotAdminTitle: "ELITE is not administrator access",
  pricingNotAdminBody:
    "Every plan here is a customer subscription. Administrator permissions are granted separately in the database and are never derived from a plan.",
  // COMPLIANCE
  pricingFineprint:
    "Phase 1 data is synthetic. Predictions are experimental; EDGE and RADAR are development heuristics. Checkout activates only once approved Stripe price IDs are configured, and no payment is taken before then.",

  planFreeName: "FREE",
  planFreeFor: "For getting oriented",
  planFreePitch: "A clear, honest look at how VELYQ reads a market.",
  planFreeFeature1: "The Today command centre",
  planFreeFeature2: "EDGE preview",
  planFreeFeature3: "RADAR preview",
  planFreeLimit: "Match Intelligence detail is not included",

  planProName: "PRO",
  planProFor: "For regular analysis",
  planProPitch: "The full picture on every tracked match, every day.",
  planProFeature1: "Everything in FREE",
  planProFeature2: "Full EDGE table, every metric",
  planProFeature3: "Full RADAR movement evidence",
  planProFeature4: "Complete Match Intelligence pages",
  planProLimit: "Introductory pricing during the beta",

  planEliteName: "ELITE",
  planEliteFor: "For power users",
  planElitePitch: "PRO, plus first access to everything we ship next.",
  planEliteFeature1: "Everything in PRO",
  planEliteFeature2: "First access to new modules as they ship",
  planEliteFeature3: "Direct line for feature requests",
  planEliteLimit:
    "Intelligence access currently matches PRO — ELITE-only capabilities are still in development",

  // ----------------------------------------------------------------- auth
  authSignInKicker: "Customer access",
  authSignInTitle: "Welcome back.",
  authSignInBody: "Sign in to your sports market intelligence workspace.",
  authSignInSubmit: "Sign in",
  authSignInError: "Email or password is incorrect. Please try again.",
  authSignInFooter: "Your session is held and verified on our servers.",
  authNoAccount: "New to VELYQ?",
  authForgotPassword: "Forgot your password?",

  authSignUpKicker: "Create your account",
  authSignUpTitle: "Create your account.",
  authSignUpBody: "Start free. No card, no commitment.",
  authSignUpSubmit: "Create free account",
  authSignUpError:
    "We could not create the account. Check your details and try again.",
  authSignUpFooter:
    "Every new account starts on the FREE plan. Access is assigned on our servers.",
  authSignUpLegal:
    "By creating an account you accept our terms and privacy notice.",
  authHaveAccount: "Already have an account?",

  authForgotKicker: "Account recovery",
  authForgotTitle: "Reset your password.",
  authForgotBody: "Enter your email and we will send you a recovery link.",
  authForgotSubmit: "Send recovery link",
  authForgotError: "Recovery is unavailable right now. Please try again later.",

  authResetKicker: "Account recovery",
  authResetTitle: "Set a new password.",
  authResetBody: "Choose a new password for your VELYQ account.",
  authResetSubmit: "Save password",
  authResetInvalid: "This recovery link is invalid or has expired.",

  authEmailLabel: "Email",
  authPasswordLabel: "Password",
  authNewPasswordLabel: "New password",
  authPasswordHint: "At least 8 characters.",
  authShowPassword: "Show password",
  authHidePassword: "Hide password",

  authAsideTitle: "Read the market, not the noise.",
  authAsidePoint1: "Model probability against the current price",
  authAsidePoint2: "Opening-to-current movement, with freshness",
  authAsidePoint3: "A recommendation only when the evidence allows one",
  // COMPLIANCE
  authAsideNotice:
    "Synthetic beta · experimental model · no guaranteed outcomes",

  // ---------------------------------------------------------------- today
  todayKicker: "Command centre",
  todayTitle: "What needs your attention?",
  todaySnapshot: "Snapshot as of {time} UTC",
  todayLeadStrong:
    "{match} — {selection} at {odds}. The model gives it {model}; the price implies {implied}.",
  todayLeadNone:
    "Nothing clears the EDGE threshold right now. That is a finding, not a gap.",
  todayLeadSummary:
    "{waiting} waiting on more evidence · {blocked} blocked on data quality",
  todayTracked: "Tracked matches",
  todayFreshMoves: "Fresh price moves",
  todayQualityWarnings: "Quality warnings",
  todayActionable: "Actionable now",
  todayTopEdge: "Top EDGE opportunities",
  todayMovements: "Latest market movement",
  todayViewRadar: "View RADAR",
  todayViewEdge: "View EDGE",
  todayLineupWatch: "Waiting on lineups",
  todayLineupWatchEmpty: "No match is currently waiting on a lineup.",
  todayQualityPanel: "Quality warnings",
  todayQualityEmpty: "Every tracked match passed its quality gate.",
  todayNoEdge: "No match currently clears the EDGE threshold.",
  todayNoMovement: "No price movement has been observed yet.",
  todayFullTime1x2: "Full-time 1X2",

  // ----------------------------------------------------------------- edge
  edgeKicker: "EDGE engine",
  edgeTitle: "Value, with context.",
  edgeBody:
    "Where is the market's price more generous than our model thinks it should be? A positive edge answers that — it is not a prediction that the outcome will happen.",
  edgeCurrentOpportunities: "Current opportunities",
  edgeTracked: "{count} tracked",
  edgeGated: "Waiting on evidence",
  edgeGatedNote:
    "These matches produced no estimate. The reason is shown on each row.",
  edgeColumnSelection: "Match and selection",
  edgeColumnOdds: "Odds",
  edgeColumnModelProbability: "Model probability",
  edgeColumnImpliedProbability: "Implied probability",
  edgeColumnFairOdds: "Fair odds",
  edgeColumnEdge: "Probability edge",
  edgeColumnEv: "Expected value",
  edgeColumnQuality: "Quality",
  edgeEmpty: "No opportunities are being tracked right now.",
  edgeSortNote: "Ordered by probability edge, strongest first.",

  // ---------------------------------------------------------------- radar
  radarKicker: "RADAR · market evidence",
  radarTitle: "Movement, observed.",
  // COMPLIANCE
  radarBody:
    "Observed odds only. VELYQ does not observe and does not claim to observe money volume, stake handle or who placed a bet.",
  radarMarketMovement: "Market movement",
  radarFreshnessAware: "Freshness-aware evidence",
  radarOpening: "Opening",
  radarCurrent: "Current",
  radarMovement: "Movement",
  radarFreshness: "Freshness",
  radarHistory: "Observed price history",
  radarNoHistory: "No price history available",
  radarDrifted: "Price drifted out",
  radarShortened: "Price shortened in",
  radarUnchanged: "Price unchanged",
  radarEmpty: "No market observations are available yet.",

  // ---------------------------------------------------- match intelligence
  matchKicker: "Match Intelligence · football",
  matchVersus: "vs",
  matchVerdict: "Verdict",
  matchSummary: "Summary",
  matchRecommendation: "Recommendation",
  matchMarket: "Model against market",
  matchEdgeBreakdown: "EDGE breakdown",
  matchRadarEvidence: "RADAR evidence",
  matchQuality: "Data quality",
  matchLineup: "Lineup state",
  matchWhy: "Why this verdict",
  matchTrace: "Trace metadata",
  matchSelection: "Selection",
  matchCurrentOdds: "Current odds",
  matchModelProbability: "Model probability",
  matchImpliedProbability: "Implied probability",
  matchFairOdds: "Fair odds",
  matchExpectedValue: "Expected value",
  matchProbabilityEdge: "Probability edge",
  matchQualityGate: "Quality gate",
  matchScoreDefinition: "Score definition",
  matchGrade: "Grade",
  matchOpeningToCurrent: "Opening {opening} → current {current}",
  // COMPLIANCE
  matchNoMoneyFlow:
    "No money-flow, stake-volume or insider-activity claims are made anywhere on this page.",
  matchPriceEvidence: "Price evidence",
  matchLineupCertainty: "Lineup certainty",
  matchDataFreshness: "Data freshness",
  matchMappingQuality: "Market matching",
  matchAvailable: "Available",
  matchMissing: "Missing",
  matchAllChecksPassed: "All required quality checks passed.",
  matchLineupOfficialBody: "An official lineup has been observed.",
  matchLineupMissingBody:
    "No lineup is available, so the recommendation stays gated.",
  matchLineupOtherBody: "The lineup is {state}.",
  matchLineupEvidenceNote: "Lineup state is evidence, not a prediction.",
  // COMPLIANCE
  matchModelDisclaimer:
    "This is an experimental deterministic model, not a validated betting model.",
  matchTraceModel: "Model",
  matchTraceCalibration: "Calibration",
  matchTraceScore: "Score",
  matchTraceQualityPolicy: "Quality policy",
  matchTracePriceSnapshot: "Price snapshot",
  matchTraceFeatureCutoff: "Feature cutoff",
  matchTraceToggle: "Technical trace",
  matchTraceHint: "Version and audit detail for this estimate.",
  matchModelVsMarket: "Model {model} · market {implied}",
  matchNoEstimate: "No estimate was produced for this match.",

  // -------------------------------------------------------------- account
  accountKicker: "Account",
  accountTitle: "Your workspace.",
  accountBody: "Your plan, your access and your language, in one place.",
  accountSignedInAs: "Signed in as",
  accountPlan: "Plan",
  accountPlanNote: "Access is resolved on our servers on every request.",
  accountSubscription: "Subscription",
  accountStatus: "Status",
  accountStatusNone: "No paid subscription",
  accountStatusActive: "Active",
  accountStatusTrialing: "Trial",
  accountStatusPastDue: "Payment overdue",
  accountStatusCanceled: "Cancelled",
  accountStatusUnpaid: "Unpaid",
  accountStatusIncomplete: "Incomplete",
  accountStatusIncompleteExpired: "Expired before completion",
  accountEntitlements: "Included in your plan",
  accountBilling: "Billing",
  accountBillingInactive:
    "Paid billing is not active in the current beta, so nothing is being charged. Your FREE access remains fully usable.",
  accountManageBilling: "Manage billing",
  accountUpgrade: "Compare plans",
  accountLanguage: "Language",
  accountLanguageBody: "Your language preference is stored on this device.",
  accountSecurity: "Security",
  accountSecurityBody:
    "Sessions are held on our servers. Sign out to end this session on this device.",
  accountChangePassword: "Change your password",
  accountAdminNote:
    "Administrator access is granted by database permissions and is completely independent of your plan.",
  accountEnvironment: "Environment",

  // ------------------------------------------------------- entitlements
  entitlementTodayView: "Today command centre",
  entitlementEdgePreview: "EDGE preview",
  entitlementEdgeFull: "Full EDGE table",
  entitlementRadarPreview: "RADAR preview",
  entitlementRadarFull: "Full RADAR evidence",
  entitlementMatchDetail: "Match Intelligence pages",

  // ---------------------------------------------------------------- legal
  legalKicker: "Public information",
  termsTitle: "Terms of use",
  // COMPLIANCE
  termsBody1:
    "VELYQ provides sports market intelligence for information and research. Phase 1 uses synthetic data and experimental models.",
  // COMPLIANCE
  termsBody2:
    "This draft requires legal review before commercial scale. VELYQ does not provide financial advice, does not guarantee outcomes and does not execute wagers.",
  privacyTitle: "Privacy",
  privacyBody1:
    "VELYQ processes the account and service data needed to authenticate you, provide the product and keep the service secure. We do not store card details; Stripe handles all payment data.",
  privacyBody2:
    "This draft requires legal review for the applicable launch jurisdictions.",
  responsibleUseTitle: "Responsible use",
  responsibleUseHeading: "Use intelligence responsibly.",
  // COMPLIANCE
  responsibleUseBody1:
    "VELYQ is not a betting system. It does not execute wagers and it does not promise profit. Predictions are experimental, and EDGE and RADAR are development heuristics built on synthetic Phase 1 data.",
  // COMPLIANCE
  responsibleUseBody2:
    "Never stake money you cannot afford to lose. If gambling is affecting your life, seek support from a licensed service in your country. This draft requires legal review.",
  subscriptionTermsTitle: "Subscription terms",
  subscriptionBody1:
    "Paid plans, once enabled, are billed through Stripe Checkout and managed through the Stripe Billing Portal. Cancellation is handled there and takes effect according to the billing period shown at the time.",
  subscriptionBody2:
    "Refund policy and final commercial terms require owner and legal review before any live charge is taken.",

  // -------------------------------------------------- explanations (help)
  explainEdgeTitle: "What is EDGE?",
  explainEdgeBody:
    "EDGE compares the probability our model assigns to an outcome with the probability implied by the current price. A positive edge means the price looks generous relative to the model. It is not a prediction that the outcome will happen.",
  explainEvTitle: "What is expected value?",
  explainEvBody:
    "Expected value is the average result per unit staked if the model probability were correct and the same situation repeated many times. It is a way of comparing prices, not a forecast of profit.",
  explainImpliedTitle: "What is implied probability?",
  explainImpliedBody:
    "Implied probability is the price converted back into a percentage. Odds of 2.00 imply a 50% chance, before any bookmaker margin is removed.",
  explainFairOddsTitle: "What are fair odds?",
  explainFairOddsBody:
    "Fair odds are the price that would exactly match the model's probability. Comparing them against the market price is what produces the edge.",
  explainRadarTitle: "What does RADAR observe?",
  // COMPLIANCE
  explainRadarBody:
    "RADAR records the opening price and the current price for a selection, and how recently each was seen. It reports movement only — it does not observe stake volume, money flow or who placed a bet.",
  explainQualityTitle: "What is the quality grade?",
  explainQualityBody:
    "Every match is graded A to F on how complete and how recent its inputs are. A low grade means the recommendation is withheld, or should be treated with extra caution.",
  explainFreshnessTitle: "What does freshness mean?",
  explainFreshnessBody:
    "Freshness says how recently the price was observed. An out-of-date observation may no longer reflect the market.",

  // ------------------------------------------------------ recommendations
  recStrongEdge: "Strong edge",
  recStrongEdgeBody:
    "The model's probability is meaningfully above the probability implied by the current price, and the quality gate passed.",
  recWait: "Wait",
  recWaitBody:
    "The current evidence does not reach the recommendation threshold. Worth monitoring rather than acting on.",
  recWaitForLineup: "Wait for lineup",
  recWaitForLineupBody:
    "The recommendation is held back until an official lineup is published, because a late team change would materially move the estimate.",
  recNoBet: "No recommendation",
  recNoBetBody:
    "There is no observable advantage at the current price. The honest answer is to pass.",
  recInsufficientData: "Insufficient data",
  recInsufficientDataBody:
    "Required price or coverage inputs are missing, so no estimate was produced. VELYQ does not guess.",
  recEdgeDisappeared: "Edge disappeared",
  recEdgeDisappearedBody:
    "An earlier price advantage is no longer visible at the current quote — the market has repriced.",

  // ------------------------------------------------------------- lineups
  lineupOfficial: "Official",
  lineupExpected: "Expected",
  lineupMissing: "Not published",
  lineupChanged: "Changed",

  // ----------------------------------------------------------- freshness
  freshnessFresh: "Recent",
  freshnessStale: "Out of date",

  // -------------------------------------------------------- reason codes
  reasonMissingLineup: "Lineup not published yet",
  reasonStaleData: "Observation is out of date",
  reasonMissingPrice: "No current price observed",
  reasonWaitingForConfirmation: "Waiting for confirmation",
  reasonLowMappingConfidence: "Low confidence matching this market",
  reasonEdgeDisappeared: "Edge no longer present",
  reasonRepriced: "Market has repriced",
  reasonInsufficientCoverage: "Not enough market coverage",
} as const;

export type MessageKey = keyof typeof messages;

/**
 * Greek catalog, informal singular register.
 *
 * Terminology decisions: "odds" is αποδόσεις (the standard Greek market term)
 * and is never rendered as πιθανότητες, which is reserved for probability;
 * "freshness" is επικαιρότητα rather than the literal φρεσκάδα; NO_BET is
 * «Χωρίς σύσταση» rather than «Όχι στοίχημα», because VELYQ states model
 * states and never issues betting instructions.
 */
const greek: Readonly<Record<MessageKey, string>> = {
  brandTagline: "Πλατφόρμα ανάλυσης",
  productMatchIntelligence: "Match Intelligence",
  productMatchIntelligenceSubtitle: "Πλήρης ανάλυση αγώνα",

  navToday: "Σήμερα",
  navEdge: "EDGE",
  navRadar: "RADAR",
  navMatchIntelligence: "Match Intelligence",
  navAccount: "Λογαριασμός",
  navPricing: "Πακέτα",
  navPlatform: "Πλατφόρμα",
  navResponsibleUse: "Υπεύθυνη χρήση",
  navPrimaryLabel: "Κύρια πλοήγηση",
  navSkipToContent: "Μετάβαση στο κύριο περιεχόμενο",
  navSectionIntelligence: "Ανάλυση",
  adminConsole: "Κονσόλα διαχείρισης",
  signOut: "Αποσύνδεση",
  sessionActive: "Ενεργή συνεδρία",
  languageSelector: "Γλώσσα",
  languageSelectorHint: "Διάλεξε γλώσσα",

  syntheticData: "Συνθετικά δεδομένα",
  developmentHeuristic: "Ευρετικός δείκτης υπό ανάπτυξη",
  experimental: "Πειραματικό",
  observableOnly: "Μόνο παρατηρήσιμα στοιχεία",
  traceable: "Ιχνηλάσιμο",
  noEvidence: "Χωρίς στοιχεία",
  radarMove: "Καταγράφηκε κίνηση",
  viewAll: "Δες τα όλα",
  openMatchIntelligence: "Άνοιγμα Match Intelligence",
  backToSignIn: "Επιστροφή στη σύνδεση",
  syntheticEnvironment: "Περιβάλλον synthetic beta",
  researchUse: "Πειραματικό · για ερευνητική χρήση",

  metaTitle: "VELYQ — Ανάλυση αθλητικών αγορών",
  metaDescription:
    "Ιχνηλάσιμη ανάλυση αθλητικών αγορών: η πιθανότητα του μοντέλου απέναντι στις τρέχουσες αποδόσεις, καταγεγραμμένη κίνηση τιμών και πλήρες ίχνος πίσω από κάθε νούμερο.",

  customerUnavailable: "Τα δεδομένα δεν είναι διαθέσιμα αυτή τη στιγμή.",
  customerUnavailableBody:
    "Η υπηρεσία ανάλυσης δεν απάντησε. Δεν υπάρχει πρόβλημα με τον λογαριασμό σου — δοκίμασε ξανά σε λίγο.",
  customerLoading: "Φόρτωση της ανάλυσής σου…",
  dataUnavailable: "Δεν υπάρχει κάτι να εμφανιστεί ακόμη.",
  dataUnavailableBody:
    "Δεν έχει παραχθεί ανάλυση για αυτή την περίοδο. Νέες παρατηρήσεις εμφανίζονται εδώ μόλις συλλεχθούν.",
  matchNotFound: "Ο αγώνας δεν βρέθηκε.",
  matchNotFoundBody:
    "Ο αγώνας δεν βρίσκεται πλέον στο τρέχον παράθυρο ανάλυσης ή ο σύνδεσμος είναι λανθασμένος.",
  retry: "Δοκίμασε ξανά",
  backToToday: "Επιστροφή στο Σήμερα",

  homeSignIn: "Σύνδεση",
  homeCreateAccount: "Δημιουργία λογαριασμού",

  homeHeroEyebrow: "Synthetic beta · Πειραματικό μοντέλο",
  homeHeroTitleLead: "Δες το σήμα",
  homeHeroTitleAccent: "πριν από τον θόρυβο.",
  homeHeroBody:
    "Το VELYQ συγκρίνει αυτό που εκτιμά το μοντέλο μας με αυτό που χρεώνει η αγορά — ώστε να ξεχωρίζεις ένα πραγματικά λάθος τιμολογημένο αποτέλεσμα από μια απλή κίνηση τιμής.",
  homeHeroPrimaryCta: "Δημιουργία δωρεάν λογαριασμού",
  homeHeroSecondaryCta: "Σύνδεση",
  homeHeroPricingCta: "Δες τα πακέτα",
  homeTrustEvidence: "Στοιχεία που μπορείς να ελέγξεις",
  homeTrustNoClaims: "Καμία εγγύηση αποτελέσματος",
  homeTrustBilingual: "Ελληνικά και Αγγλικά",

  homePreviewLabel: "Προεπισκόπηση προϊόντος · συνθετικά δεδομένα",
  homePreviewEdge: "Διαφορά πιθανότητας",
  homePreviewModel: "Μοντέλο",
  homePreviewMarket: "Αγορά",
  homePreviewRadar: "Κίνηση αγοράς",
  homePreviewQuality: "Ποιότητα",
  homePreviewOpening: "Άνοιγμα",
  homePreviewCurrent: "Τώρα",
  homePreviewTracked: "Υπό παρακολούθηση σήμερα",

  homeValueEyebrow: "Ένας ενιαίος χώρος εργασίας",
  homeValueTitle: "Από την κίνηση της αγοράς σε ουσιαστικό πλαίσιο.",
  homeValueBody:
    "Κάθε οθόνη κρατά ξεχωριστά την πιθανότητα, την αξία, τα στοιχεία, την επικαιρότητα και την κατάσταση σύστασης — ώστε η εικόνα να παραμένει ειλικρινής και να ξέρεις πάντα σε τι στηρίζεται κάθε νούμερο.",
  homeValueOneTitle: "Η πιθανότητα δεν είναι αξία",
  homeValueOneBody:
    "Ένα πιθανό αποτέλεσμα και ένα καλά τιμολογημένο αποτέλεσμα είναι δύο διαφορετικά πράγματα. Το VELYQ δείχνει και τα δύο, δίπλα δίπλα.",
  homeValueTwoTitle: "Κάθε νούμερο έχει πηγή",
  homeValueTwoBody:
    "Η έκδοση του μοντέλου, η βαθμονόμηση, ο βαθμός ποιότητας και το χρονικό όριο δεδομένων συνοδεύουν κάθε σύσταση.",
  homeValueThreeTitle: "Η σιωπή είναι έγκυρη απάντηση",
  homeValueThreeBody:
    "Όταν τα στοιχεία δεν επαρκούν, το VELYQ το λέει ανοιχτά αντί να κατασκευάσει σήμα.",

  homeModulesEyebrow: "Τρεις ενότητες, μία εικόνα",
  homeModulesTitle: "Τι θα βρεις μέσα.",
  homeEdgeLabel: "01 / EDGE",
  homeEdgeTitle: "Αξία, με πλαίσιο.",
  homeEdgeBody:
    "Το EDGE βάζει δίπλα δίπλα την πιθανότητα του μοντέλου μας και την πιθανότητα που υπονοεί η απόδοση. Αν το μοντέλο δίνει 60% και η απόδοση 1.85 υπονοεί 54%, αυτή η διαφορά έξι μονάδων είναι το πλεονέκτημα — με δίκαιη απόδοση και αναμενόμενη αξία, ποτέ χωρίς τις παραδοχές του.",
  homeEdgePoint1: "Πιθανότητα μοντέλου έναντι τεκμαρτής",
  homeEdgePoint2: "Δίκαιη απόδοση και αναμενόμενη αξία",
  homeEdgePoint3: "Βαθμός ποιότητας σε κάθε γραμμή",
  homeRadarLabel: "02 / RADAR",
  homeRadarTitle: "Κίνηση, όπως καταγράφηκε.",
  homeRadarBody:
    "Το RADAR καταγράφει πού άνοιξε μια απόδοση, πού βρίσκεται τώρα και πόσο πρόσφατα καταγράφηκε — ώστε να ξεχωρίζεις μια αγορά που όντως κινήθηκε από μια που απλώς δεν έχει ελεγχθεί.",
  homeRadarPoint1: "Από την απόδοση ανοίγματος στην τρέχουσα",
  homeRadarPoint2: "Κατεύθυνση και μέγεθος της κίνησης",
  homeRadarPoint3: "Επικαιρότητα σε κάθε παρατήρηση",
  homeMatchLabel: "03 / MATCH INTELLIGENCE",
  homeMatchTitle: "Η πλήρης εικόνα.",
  homeMatchBody:
    "Μία σελίδα ανά αγώνα, που δίνει πρώτα το συμπέρασμα και από κάτω όλη τη διαδρομή του: σύσταση και αιτιολόγηση, μοντέλο έναντι αγοράς, στοιχεία κίνησης, ποιότητα δεδομένων, κατάσταση σύνθεσης και πλήρες ίχνος μοντέλου.",
  homeMatchPoint1: "Το συμπέρασμα, με την αιτιολόγησή του δίπλα",
  homeMatchPoint2: "Ορατοί έλεγχοι ποιότητας και σύνθεσης",
  homeMatchPoint3: "Πλήρες, ελέγξιμο ίχνος μοντέλου",

  homeHowEyebrow: "Πώς λειτουργεί",
  homeHowTitle: "Τέσσερα βήματα, χωρίς μαύρο κουτί.",
  homeHowOneTitle: "Καταγραφή",
  homeHowOneBody:
    "Οι αποδόσεις της αγοράς καταγράφονται ως αμετάβλητες παρατηρήσεις, με χρονοσήμανση και πηγή.",
  homeHowTwoTitle: "Βαθμολόγηση στοιχείων",
  homeHowTwoBody:
    "Κάθε αγώνας βαθμολογείται από Α έως F. Παλιές αποδόσεις, ελλιπείς συνθέσεις και αδύναμες αντιστοιχίσεις αγοράς επισημαίνονται, δεν κρύβονται.",
  homeHowThreeTitle: "Εκτίμηση",
  homeHowThreeBody:
    "Ένα πειραματικό μοντέλο παράγει μια πιθανότητα, που γίνεται δίκαιη απόδοση και αναμενόμενη αξία, συγκρίσιμη με την αγορά.",
  homeHowFourTitle: "Σύσταση ή αναμονή",
  homeHowFourBody:
    "Σύσταση δίνεται μόνο όταν περάσει ο έλεγχος ποιότητας. Διαφορετικά, το VELYQ σου λέει ακριβώς τι λείπει.",

  homeWhyEyebrow: "Γιατί VELYQ",
  homeWhyTitle: "Φτιαγμένο για όσους θέλουν να έχουν δίκιο, όχι τύχη.",
  homeWhyOneTitle: "Ειλικρίνεια στην αβεβαιότητα",
  homeWhyOneBody:
    "Καμία εγγύηση, κανένα σίγουρο. Η βεβαιότητα εκφράζεται ως στοιχεία και βαθμός ποιότητας, ποτέ ως υπερβολή.",
  homeWhyTwoTitle: "Ιχνηλάσιμο εξ ορισμού",
  homeWhyTwoBody:
    "Κάθε τιμή φέρει την έκδοση μοντέλου, τη βαθμονόμηση και το χρονικό όριό της, ώστε να ελέγχεις κάθε απόφαση πολύ αργότερα.",
  homeWhyThreeTitle: "Γρήγορο στην ανάγνωση",
  homeWhyThreeBody:
    "Το Σήμερα απαντά πρώτα σε ένα ερώτημα: τι αξίζει πραγματικά την προσοχή σου τώρα;",
  homeWhyFourTitle: "Ελληνικά και Αγγλικά",
  homeWhyFourBody:
    "Ολόκληρο το προϊόν και στις δύο γλώσσες, με ένα κλικ — μαζί με κάθε επεξήγηση και κάθε γνωστοποίηση.",

  homePricingEyebrow: "Πακέτα",
  homePricingTitle: "Ξεκίνα δωρεάν. Αναβάθμισε όταν το αξίζει.",
  homePricingBody:
    "Τα πακέτα ελέγχουν μόνο λειτουργίες πελάτη. Δεν παρέχουν ποτέ δικαιώματα διαχειριστή.",
  homePricingCta: "Σύγκριση όλων των πακέτων",

  homeNoticeTitle: "Σχετικά με αυτή τη beta",
  homeNoticeBody:
    "Η Φάση 1 λειτουργεί με συνθετικά δεδομένα και πειραματικό μοντέλο. Τα EDGE και RADAR είναι ευρετικοί δείκτες υπό ανάπτυξη, όχι επικυρωμένα μοντέλα στοιχηματισμού. Το VELYQ είναι εργαλείο ανάλυσης για έρευνα και ενημέρωση — δεν παρέχει οικονομικές συμβουλές, δεν εγγυάται κανένα αποτέλεσμα και δεν τοποθετεί στοιχήματα. Μην ποντάρεις ποτέ χρήματα που δεν μπορείς να χάσεις.",
  homeNoticeLink: "Διάβασε τη σημείωση υπεύθυνης χρήσης",

  homeFinalEyebrow: "Ξεκίνα από το σήμα",
  homeFinalTitle: "Χτίσε μια πιο ψύχραιμη συνήθεια ανάλυσης.",
  homeFinalBody:
    "Η δωρεάν πρόσβαση είναι ανοιχτή — ολόκληρο το κέντρο ελέγχου «Σήμερα», το EDGE και το RADAR, στα Ελληνικά ή στα Αγγλικά.",
  homeFinalCta: "Δημιούργησε δωρεάν λογαριασμό",

  footerRights: "Ανάλυση αθλητικών αγορών με AI",
  footerCreatedBy: "Created by",
  footerTerms: "Όροι χρήσης",
  footerPrivacy: "Απόρρητο",
  footerResponsibleUse: "Υπεύθυνη χρήση",
  footerSubscriptionTerms: "Όροι συνδρομής",

  pricingKicker: "Πακέτα",
  pricingTitle: "Διάλεξε το επίπεδο πρόσβασης που σου ταιριάζει.",
  pricingBody:
    "Τα πακέτα ελέγχουν μόνο λειτουργίες πελάτη. Δεν παρέχουν ποτέ δικαιώματα διαχειριστή — τα δικαιώματα διαχείρισης δίνονται ξεχωριστά και επιλύονται στον διακομιστή.",
  pricingPerMonth: "τον μήνα",
  pricingFreeWhileBeta: "Δωρεάν κατά τη διάρκεια της beta",
  pricingIntroductory: "Εισαγωγική τιμή",
  pricingMostPopular: "Πιο δημοφιλές",
  pricingCurrentPlan: "Το τρέχον πακέτο σου",
  pricingBillingPending: "Εκκρεμεί ενεργοποίηση χρέωσης",
  pricingBillingPendingHint:
    "Η πληρωμή ανοίγει μόλις ρυθμιστεί η χρέωση. Σήμερα δεν χρεώνεται τίποτα.",
  pricingStartCheckout: "Συνέχεια στην πληρωμή",
  pricingIncluded: "Τι περιλαμβάνει",
  pricingLimits: "Καλό να ξέρεις",
  pricingNotAdminTitle: "Το ELITE δεν είναι πρόσβαση διαχειριστή",
  pricingNotAdminBody:
    "Κάθε πακέτο εδώ είναι συνδρομή πελάτη. Τα δικαιώματα διαχειριστή δίνονται ξεχωριστά στη βάση δεδομένων και δεν προκύπτουν ποτέ από το πακέτο.",
  pricingFineprint:
    "Τα δεδομένα της Φάσης 1 είναι συνθετικά. Οι προβλέψεις είναι πειραματικές· τα EDGE και RADAR είναι ευρετικοί δείκτες υπό ανάπτυξη. Η πληρωμή ενεργοποιείται μόνο αφού ρυθμιστούν εγκεκριμένα Stripe price IDs, και μέχρι τότε δεν γίνεται καμία χρέωση.",

  planFreeName: "FREE",
  planFreeFor: "Για μια πρώτη εικόνα",
  planFreePitch:
    "Μια καθαρή, ειλικρινής ματιά στο πώς διαβάζει το VELYQ την αγορά.",
  planFreeFeature1: "Το κέντρο ελέγχου «Σήμερα»",
  planFreeFeature2: "Προεπισκόπηση EDGE",
  planFreeFeature3: "Προεπισκόπηση RADAR",
  planFreeLimit: "Δεν περιλαμβάνεται η αναλυτική σελίδα Match Intelligence",

  planProName: "PRO",
  planProFor: "Για συστηματική ανάλυση",
  planProPitch: "Η πλήρης εικόνα για κάθε αγώνα, κάθε μέρα.",
  planProFeature1: "Όλα όσα περιλαμβάνει το FREE",
  planProFeature2: "Πλήρης πίνακας EDGE, με όλους τους δείκτες",
  planProFeature3: "Πλήρη στοιχεία κίνησης RADAR",
  planProFeature4: "Πλήρεις σελίδες Match Intelligence",
  planProLimit: "Εισαγωγική τιμή κατά τη διάρκεια της beta",

  planEliteName: "ELITE",
  planEliteFor: "Για προχωρημένους χρήστες",
  planElitePitch: "Το PRO, με πρώτη πρόσβαση σε ό,τι κυκλοφορεί στη συνέχεια.",
  planEliteFeature1: "Όλα όσα περιλαμβάνει το PRO",
  planEliteFeature2: "Πρώτη πρόσβαση σε νέες ενότητες μόλις κυκλοφορούν",
  planEliteFeature3: "Απευθείας γραμμή για αιτήματα λειτουργιών",
  planEliteLimit:
    "Η πρόσβαση στην ανάλυση είναι προς το παρόν ίδια με το PRO — οι αποκλειστικές δυνατότητες ELITE είναι υπό ανάπτυξη",

  authSignInKicker: "Πρόσβαση πελάτη",
  authSignInTitle: "Καλώς όρισες ξανά.",
  authSignInBody: "Συνδέσου στον χώρο ανάλυσης αθλητικών αγορών.",
  authSignInSubmit: "Σύνδεση",
  authSignInError: "Το email ή ο κωδικός δεν είναι σωστά. Δοκίμασε ξανά.",
  authSignInFooter:
    "Η συνεδρία σου τηρείται και ελέγχεται στους διακομιστές μας.",
  authNoAccount: "Πρώτη φορά στο VELYQ;",
  authForgotPassword: "Ξέχασες τον κωδικό σου;",

  authSignUpKicker: "Δημιουργία λογαριασμού",
  authSignUpTitle: "Δημιούργησε τον λογαριασμό σου.",
  authSignUpBody: "Ξεκίνα δωρεάν. Χωρίς κάρτα, χωρίς δέσμευση.",
  authSignUpSubmit: "Δημιουργία δωρεάν λογαριασμού",
  authSignUpError:
    "Δεν μπορέσαμε να δημιουργήσουμε τον λογαριασμό. Έλεγξε τα στοιχεία σου και δοκίμασε ξανά.",
  authSignUpFooter:
    "Κάθε νέος λογαριασμός ξεκινά στο πακέτο FREE. Η πρόσβαση αποδίδεται στους διακομιστές μας.",
  authSignUpLegal:
    "Δημιουργώντας λογαριασμό αποδέχεσαι τους όρους χρήσης και τη σημείωση απορρήτου.",
  authHaveAccount: "Έχεις ήδη λογαριασμό;",

  authForgotKicker: "Ανάκτηση λογαριασμού",
  authForgotTitle: "Επαναφορά κωδικού.",
  authForgotBody: "Δώσε το email σου και θα σου στείλουμε σύνδεσμο ανάκτησης.",
  authForgotSubmit: "Αποστολή συνδέσμου",
  authForgotError:
    "Η ανάκτηση δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκίμασε ξανά αργότερα.",

  authResetKicker: "Ανάκτηση λογαριασμού",
  authResetTitle: "Όρισε νέο κωδικό.",
  authResetBody: "Διάλεξε νέο κωδικό για τον λογαριασμό σου στο VELYQ.",
  authResetSubmit: "Αποθήκευση κωδικού",
  authResetInvalid: "Ο σύνδεσμος ανάκτησης δεν είναι έγκυρος ή έχει λήξει.",

  authEmailLabel: "Email",
  authPasswordLabel: "Κωδικός",
  authNewPasswordLabel: "Νέος κωδικός",
  authPasswordHint: "Τουλάχιστον 8 χαρακτήρες.",
  authShowPassword: "Εμφάνιση κωδικού",
  authHidePassword: "Απόκρυψη κωδικού",

  authAsideTitle: "Διάβασε την αγορά, όχι τον θόρυβο.",
  authAsidePoint1: "Πιθανότητα μοντέλου έναντι της τρέχουσας απόδοσης",
  authAsidePoint2: "Κίνηση από το άνοιγμα μέχρι τώρα, με επικαιρότητα",
  authAsidePoint3: "Σύσταση μόνο όταν το επιτρέπουν τα στοιχεία",
  authAsideNotice:
    "Synthetic beta · πειραματικό μοντέλο · καμία εγγύηση αποτελέσματος",

  todayKicker: "Κέντρο ελέγχου",
  todayTitle: "Τι χρειάζεται την προσοχή σου;",
  todaySnapshot: "Στιγμιότυπο στις {time} UTC",
  todayLeadStrong:
    "{match} — {selection} στο {odds}. Το μοντέλο δίνει {model}, ενώ η απόδοση υπονοεί {implied}.",
  todayLeadNone:
    "Τίποτα δεν ξεπερνά αυτή τη στιγμή το όριο EDGE. Και αυτό είναι εύρημα, όχι κενό.",
  todayLeadSummary:
    "{waiting} σε αναμονή στοιχείων · {blocked} σε αναστολή λόγω ποιότητας δεδομένων",
  todayTracked: "Αγώνες υπό παρακολούθηση",
  todayFreshMoves: "Πρόσφατες κινήσεις τιμών",
  todayQualityWarnings: "Προειδοποιήσεις ποιότητας",
  todayActionable: "Άμεσα αξιοποιήσιμα",
  todayTopEdge: "Κορυφαίες ευκαιρίες EDGE",
  todayMovements: "Πρόσφατη κίνηση αγοράς",
  todayViewRadar: "Άνοιγμα RADAR",
  todayViewEdge: "Άνοιγμα EDGE",
  todayLineupWatch: "Σε αναμονή συνθέσεων",
  todayLineupWatchEmpty: "Κανένας αγώνας δεν περιμένει σύνθεση αυτή τη στιγμή.",
  todayQualityPanel: "Προειδοποιήσεις ποιότητας",
  todayQualityEmpty: "Όλοι οι αγώνες πέρασαν τον έλεγχο ποιότητας.",
  todayNoEdge: "Κανένας αγώνας δεν ξεπερνά αυτή τη στιγμή το όριο EDGE.",
  todayNoMovement: "Δεν έχει καταγραφεί ακόμη κίνηση τιμής.",
  todayFullTime1x2: "Τελικό αποτέλεσμα 1X2",

  edgeKicker: "Μηχανή EDGE",
  edgeTitle: "Αξία, με πλαίσιο.",
  edgeBody:
    "Πού είναι η απόδοση της αγοράς πιο γενναιόδωρη από ό,τι εκτιμά το μοντέλο μας; Μια θετική διαφορά απαντά σε αυτό — δεν είναι πρόβλεψη ότι το αποτέλεσμα θα συμβεί.",
  edgeCurrentOpportunities: "Τρέχουσες ευκαιρίες",
  edgeTracked: "{count} υπό παρακολούθηση",
  edgeGated: "Σε αναμονή στοιχείων",
  edgeGatedNote:
    "Για αυτούς τους αγώνες δεν παρήχθη εκτίμηση. Ο λόγος αναγράφεται σε κάθε γραμμή.",
  edgeColumnSelection: "Αγώνας και επιλογή",
  edgeColumnOdds: "Απόδοση",
  edgeColumnModelProbability: "Πιθανότητα μοντέλου",
  edgeColumnImpliedProbability: "Τεκμαρτή πιθανότητα",
  edgeColumnFairOdds: "Δίκαιη απόδοση",
  edgeColumnEdge: "Διαφορά πιθανότητας",
  edgeColumnEv: "Αναμενόμενη αξία",
  edgeColumnQuality: "Ποιότητα",
  edgeEmpty: "Δεν παρακολουθείται καμία ευκαιρία αυτή τη στιγμή.",
  edgeSortNote: "Ταξινόμηση κατά διαφορά πιθανότητας, από την ισχυρότερη.",

  radarKicker: "RADAR · στοιχεία αγοράς",
  radarTitle: "Κίνηση, όπως καταγράφηκε.",
  radarBody:
    "Μόνο καταγεγραμμένες αποδόσεις. Το VELYQ δεν παρατηρεί, ούτε ισχυρίζεται ότι παρατηρεί, όγκο χρήματος, ύψος ποντραρίσματος ή ποιος τοποθέτησε στοίχημα.",
  radarMarketMovement: "Κίνηση αγοράς",
  radarFreshnessAware: "Στοιχεία με ένδειξη επικαιρότητας",
  radarOpening: "Άνοιγμα",
  radarCurrent: "Τρέχουσα",
  radarMovement: "Μεταβολή",
  radarFreshness: "Επικαιρότητα",
  radarHistory: "Καταγεγραμμένο ιστορικό αποδόσεων",
  radarNoHistory: "Δεν υπάρχει διαθέσιμο ιστορικό αποδόσεων",
  radarDrifted: "Η απόδοση ανέβηκε",
  radarShortened: "Η απόδοση έπεσε",
  radarUnchanged: "Η απόδοση παρέμεινε σταθερή",
  radarEmpty: "Δεν υπάρχουν ακόμη διαθέσιμες παρατηρήσεις αγοράς.",

  matchKicker: "Match Intelligence · ποδόσφαιρο",
  matchVersus: "με",
  matchVerdict: "Συμπέρασμα",
  matchSummary: "Σύνοψη",
  matchRecommendation: "Σύσταση",
  matchMarket: "Μοντέλο έναντι αγοράς",
  matchEdgeBreakdown: "Ανάλυση EDGE",
  matchRadarEvidence: "Στοιχεία RADAR",
  matchQuality: "Ποιότητα δεδομένων",
  matchLineup: "Κατάσταση σύνθεσης",
  matchWhy: "Γιατί αυτό το συμπέρασμα",
  matchTrace: "Μεταδεδομένα ιχνηλασιμότητας",
  matchSelection: "Επιλογή",
  matchCurrentOdds: "Τρέχουσα απόδοση",
  matchModelProbability: "Πιθανότητα μοντέλου",
  matchImpliedProbability: "Τεκμαρτή πιθανότητα",
  matchFairOdds: "Δίκαιη απόδοση",
  matchExpectedValue: "Αναμενόμενη αξία",
  matchProbabilityEdge: "Διαφορά πιθανότητας",
  matchQualityGate: "Έλεγχος ποιότητας",
  matchScoreDefinition: "Ορισμός δείκτη",
  matchGrade: "Βαθμός",
  matchOpeningToCurrent: "Άνοιγμα {opening} → τώρα {current}",
  matchNoMoneyFlow:
    "Σε αυτή τη σελίδα δεν διατυπώνεται κανένας ισχυρισμός για ροή χρήματος, όγκο ποντραρίσματος ή προνομιακή πληροφόρηση.",
  matchPriceEvidence: "Στοιχεία απόδοσης",
  matchLineupCertainty: "Βεβαιότητα σύνθεσης",
  matchDataFreshness: "Επικαιρότητα δεδομένων",
  matchMappingQuality: "Αντιστοίχιση αγοράς",
  matchAvailable: "Διαθέσιμα",
  matchMissing: "Λείπουν",
  matchAllChecksPassed: "Όλοι οι απαιτούμενοι έλεγχοι ποιότητας πέρασαν.",
  matchLineupOfficialBody: "Έχει καταγραφεί επίσημη σύνθεση.",
  matchLineupMissingBody:
    "Δεν υπάρχει διαθέσιμη σύνθεση, οπότε η σύσταση παραμένει σε αναμονή.",
  matchLineupOtherBody: "Η σύνθεση είναι {state}.",
  matchLineupEvidenceNote: "Η σύνθεση είναι στοιχείο, όχι πρόβλεψη.",
  matchModelDisclaimer:
    "Πρόκειται για πειραματικό ντετερμινιστικό μοντέλο, όχι για επικυρωμένο μοντέλο στοιχηματισμού.",
  matchTraceModel: "Μοντέλο",
  matchTraceCalibration: "Βαθμονόμηση",
  matchTraceScore: "Δείκτης",
  matchTraceQualityPolicy: "Πολιτική ποιότητας",
  matchTracePriceSnapshot: "Στιγμιότυπο απόδοσης",
  matchTraceFeatureCutoff: "Χρονικό όριο δεδομένων",
  matchTraceToggle: "Τεχνικό ίχνος",
  matchTraceHint: "Εκδόσεις και στοιχεία ελέγχου για αυτή την εκτίμηση.",
  matchModelVsMarket: "Μοντέλο {model} · αγορά {implied}",
  matchNoEstimate: "Δεν παρήχθη εκτίμηση για αυτόν τον αγώνα.",

  accountKicker: "Λογαριασμός",
  accountTitle: "Ο χώρος σου.",
  accountBody: "Το πακέτο σου, η πρόσβασή σου και η γλώσσα σου, σε ένα σημείο.",
  accountSignedInAs: "Συνδεδεμένος ως",
  accountPlan: "Πακέτο",
  accountPlanNote: "Η πρόσβαση επιλύεται στους διακομιστές μας σε κάθε αίτημα.",
  accountSubscription: "Συνδρομή",
  accountStatus: "Κατάσταση",
  accountStatusNone: "Χωρίς συνδρομή επί πληρωμή",
  accountStatusActive: "Ενεργή",
  accountStatusTrialing: "Δοκιμαστική περίοδος",
  accountStatusPastDue: "Εκκρεμεί πληρωμή",
  accountStatusCanceled: "Ακυρωμένη",
  accountStatusUnpaid: "Απλήρωτη",
  accountStatusIncomplete: "Μη ολοκληρωμένη",
  accountStatusIncompleteExpired: "Έληξε πριν ολοκληρωθεί",
  accountEntitlements: "Περιλαμβάνονται στο πακέτο σου",
  accountBilling: "Χρέωση",
  accountBillingInactive:
    "Η χρέωση δεν είναι ενεργή στην τρέχουσα beta, οπότε δεν χρεώνεται τίποτα. Η δωρεάν πρόσβασή σου παραμένει πλήρως λειτουργική.",
  accountManageBilling: "Διαχείριση χρέωσης",
  accountUpgrade: "Σύγκριση πακέτων",
  accountLanguage: "Γλώσσα",
  accountLanguageBody: "Η προτίμηση γλώσσας αποθηκεύεται σε αυτή τη συσκευή.",
  accountSecurity: "Ασφάλεια",
  accountSecurityBody:
    "Οι συνεδρίες τηρούνται στους διακομιστές μας. Αποσυνδέσου για να τερματίσεις τη συνεδρία σε αυτή τη συσκευή.",
  accountChangePassword: "Άλλαξε τον κωδικό σου",
  accountAdminNote:
    "Η πρόσβαση διαχειριστή δίνεται από δικαιώματα βάσης δεδομένων και είναι εντελώς ανεξάρτητη από το πακέτο σου.",
  accountEnvironment: "Περιβάλλον",

  entitlementTodayView: "Κέντρο ελέγχου «Σήμερα»",
  entitlementEdgePreview: "Προεπισκόπηση EDGE",
  entitlementEdgeFull: "Πλήρης πίνακας EDGE",
  entitlementRadarPreview: "Προεπισκόπηση RADAR",
  entitlementRadarFull: "Πλήρη στοιχεία RADAR",
  entitlementMatchDetail: "Σελίδες Match Intelligence",

  legalKicker: "Δημόσια ενημέρωση",
  termsTitle: "Όροι χρήσης",
  termsBody1:
    "Το VELYQ παρέχει ανάλυση αθλητικών αγορών για ενημέρωση και έρευνα. Η Φάση 1 χρησιμοποιεί συνθετικά δεδομένα και πειραματικά μοντέλα.",
  termsBody2:
    "Το προσχέδιο αυτό απαιτεί νομικό έλεγχο πριν από εμπορική διάθεση. Το VELYQ δεν παρέχει οικονομικές συμβουλές, δεν εγγυάται αποτελέσματα και δεν εκτελεί στοιχήματα.",
  privacyTitle: "Απόρρητο",
  privacyBody1:
    "Το VELYQ επεξεργάζεται τα δεδομένα λογαριασμού και χρήσης που χρειάζονται για την ταυτοποίησή σου, τη λειτουργία του προϊόντος και την ασφάλεια της υπηρεσίας. Δεν αποθηκεύουμε στοιχεία καρτών· όλα τα δεδομένα πληρωμής τα διαχειρίζεται η Stripe.",
  privacyBody2:
    "Το προσχέδιο αυτό απαιτεί νομικό έλεγχο για τις χώρες στις οποίες θα λειτουργήσει η υπηρεσία.",
  responsibleUseTitle: "Υπεύθυνη χρήση",
  responsibleUseHeading: "Χρησιμοποίησε την ανάλυση υπεύθυνα.",
  responsibleUseBody1:
    "Το VELYQ δεν είναι σύστημα στοιχηματισμού. Δεν εκτελεί στοιχήματα και δεν υπόσχεται κέρδος. Οι προβλέψεις είναι πειραματικές και τα EDGE και RADAR είναι ευρετικοί δείκτες υπό ανάπτυξη, βασισμένοι σε συνθετικά δεδομένα της Φάσης 1.",
  responsibleUseBody2:
    "Μην ποντάρεις ποτέ χρήματα που δεν μπορείς να χάσεις. Αν ο τζόγος επηρεάζει τη ζωή σου, ζήτησε στήριξη από αδειοδοτημένη υπηρεσία στη χώρα σου. Το προσχέδιο αυτό απαιτεί νομικό έλεγχο.",
  subscriptionTermsTitle: "Όροι συνδρομής",
  subscriptionBody1:
    "Τα επί πληρωμή πακέτα, μόλις ενεργοποιηθούν, χρεώνονται μέσω Stripe Checkout και διαχειρίζονται από το Stripe Billing Portal. Η ακύρωση γίνεται από εκεί και ισχύει σύμφωνα με την περίοδο χρέωσης που εμφανίζεται εκείνη τη στιγμή.",
  subscriptionBody2:
    "Η πολιτική επιστροφών και οι τελικοί εμπορικοί όροι απαιτούν έγκριση από τον ιδιοκτήτη και νομικό έλεγχο πριν από οποιαδήποτε πραγματική χρέωση.",

  explainEdgeTitle: "Τι είναι το EDGE;",
  explainEdgeBody:
    "Το EDGE συγκρίνει την πιθανότητα που δίνει το μοντέλο μας σε ένα αποτέλεσμα με την πιθανότητα που υπονοεί η τρέχουσα απόδοση. Θετική διαφορά σημαίνει ότι η απόδοση φαίνεται γενναιόδωρη σε σχέση με το μοντέλο. Δεν είναι πρόβλεψη ότι το αποτέλεσμα θα συμβεί.",
  explainEvTitle: "Τι είναι η αναμενόμενη αξία;",
  explainEvBody:
    "Η αναμενόμενη αξία είναι το μέσο αποτέλεσμα ανά μονάδα ποντραρίσματος, αν η πιθανότητα του μοντέλου ήταν σωστή και η ίδια κατάσταση επαναλαμβανόταν πολλές φορές. Είναι τρόπος σύγκρισης αποδόσεων, όχι πρόβλεψη κέρδους.",
  explainImpliedTitle: "Τι είναι η τεκμαρτή πιθανότητα;",
  explainImpliedBody:
    "Η τεκμαρτή πιθανότητα είναι η απόδοση μετατρεμμένη ξανά σε ποσοστό. Απόδοση 2.00 υπονοεί πιθανότητα 50%, πριν αφαιρεθεί το περιθώριο του πράκτορα.",
  explainFairOddsTitle: "Τι είναι η δίκαιη απόδοση;",
  explainFairOddsBody:
    "Δίκαιη απόδοση είναι η τιμή που θα αντιστοιχούσε ακριβώς στην πιθανότητα του μοντέλου. Η σύγκρισή της με την απόδοση της αγοράς παράγει τη διαφορά.",
  explainRadarTitle: "Τι παρατηρεί το RADAR;",
  explainRadarBody:
    "Το RADAR καταγράφει την απόδοση ανοίγματος και την τρέχουσα απόδοση μιας επιλογής, καθώς και πόσο πρόσφατα καταγράφηκε η καθεμία. Αναφέρει μόνο κίνηση — δεν παρατηρεί όγκο ποντραρίσματος, ροή χρήματος ή ποιος τοποθέτησε στοίχημα.",
  explainQualityTitle: "Τι είναι ο βαθμός ποιότητας;",
  explainQualityBody:
    "Κάθε αγώνας βαθμολογείται από Α έως F ως προς το πόσο πλήρη και πόσο πρόσφατα είναι τα δεδομένα του. Χαμηλός βαθμός σημαίνει ότι η σύσταση αναστέλλεται ή πρέπει να αντιμετωπιστεί με επιπλέον προσοχή.",
  explainFreshnessTitle: "Τι σημαίνει επικαιρότητα;",
  explainFreshnessBody:
    "Η επικαιρότητα δείχνει πόσο πρόσφατα καταγράφηκε η απόδοση. Μια παλιά παρατήρηση μπορεί να μην αντικατοπτρίζει πλέον την αγορά.",

  recStrongEdge: "Ισχυρό πλεονέκτημα",
  recStrongEdgeBody:
    "Η πιθανότητα του μοντέλου είναι αισθητά υψηλότερη από την τεκμαρτή πιθανότητα της τρέχουσας απόδοσης και ο έλεγχος ποιότητας πέρασε.",
  recWait: "Αναμονή",
  recWaitBody:
    "Τα διαθέσιμα στοιχεία δεν φτάνουν το όριο σύστασης. Αξίζει παρακολούθηση, όχι δράση.",
  recWaitForLineup: "Αναμονή σύνθεσης",
  recWaitForLineupBody:
    "Η σύσταση παραμένει σε αναμονή μέχρι να ανακοινωθεί επίσημη σύνθεση, καθώς μια αλλαγή τελευταίας στιγμής θα μετακινούσε ουσιαστικά την εκτίμηση.",
  recNoBet: "Χωρίς σύσταση",
  recNoBetBody:
    "Δεν υπάρχει παρατηρήσιμο πλεονέκτημα στην τρέχουσα απόδοση. Η ειλικρινής απάντηση είναι να το προσπεράσεις.",
  recInsufficientData: "Ανεπαρκή δεδομένα",
  recInsufficientDataBody:
    "Λείπουν απαραίτητα δεδομένα απόδοσης ή κάλυψης, οπότε δεν παρήχθη εκτίμηση. Το VELYQ δεν μαντεύει.",
  recEdgeDisappeared: "Το πλεονέκτημα χάθηκε",
  recEdgeDisappearedBody:
    "Το προηγούμενο πλεονέκτημα δεν είναι πλέον ορατό στην τρέχουσα απόδοση — η αγορά αναπροσάρμοσε.",

  lineupOfficial: "Επίσημη",
  lineupExpected: "Αναμενόμενη",
  lineupMissing: "Δεν ανακοινώθηκε",
  lineupChanged: "Άλλαξε",

  freshnessFresh: "Πρόσφατα",
  freshnessStale: "Παρωχημένα",

  reasonMissingLineup: "Δεν έχει ανακοινωθεί ακόμη σύνθεση",
  reasonStaleData: "Η παρατήρηση δεν είναι πρόσφατη",
  reasonMissingPrice: "Δεν καταγράφηκε τρέχουσα απόδοση",
  reasonWaitingForConfirmation: "Σε αναμονή επιβεβαίωσης",
  reasonLowMappingConfidence: "Χαμηλή βεβαιότητα αντιστοίχισης αγοράς",
  reasonEdgeDisappeared: "Το πλεονέκτημα δεν υπάρχει πλέον",
  reasonRepriced: "Η αγορά αναπροσάρμοσε τις τιμές",
  reasonInsufficientCoverage: "Ανεπαρκής κάλυψη αγοράς",
};

export const translations: Readonly<
  Record<Locale, Readonly<Record<MessageKey, string>>>
> = {
  en: messages,
  el: greek,
};

/** English lookup, retained for locale-independent call sites and tests. */
export const message = (key: MessageKey) => messages[key];

/** Locale-aware lookup. */
export const translate = (key: MessageKey, locale: Locale = DEFAULT_LOCALE) =>
  translations[locale][key];

/**
 * Builds a bound translator for a locale, with `{name}` interpolation.
 *
 * Substituted values are always application-produced display strings
 * (formatted numbers, dates, team names from the intelligence feed), never
 * raw end-user input, and React escapes the result on render.
 */
export function translator(locale: Locale) {
  return function t(
    key: MessageKey,
    values?: Readonly<Record<string, string | number>>,
  ): string {
    const template = translations[locale][key];
    if (!values) return template;
    return template.replaceAll(/\{(\w+)\}/g, (match, name: string) => {
      const replacement = values[name];
      return replacement === undefined ? match : String(replacement);
    });
  };
}

export type Translator = ReturnType<typeof translator>;
