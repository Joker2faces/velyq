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
  brandTagline: "Football intelligence",
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
  metaTitle: "VELYQ — Football Market Intelligence",
  metaDescription:
    "Traceable football market intelligence: model probability against live prices, observed odds movement and a full trace behind every number.",

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
  accessLockedTitle: "Your plan does not include this yet.",
  accessLockedBody:
    "Nothing is wrong with your account. This surface opens on a higher plan — everything else stays exactly as it is.",

  // -------------------------------------------------- whole-page failures
  notFoundTitle: "That page does not exist.",
  notFoundBody:
    "The link may be out of date, or the address may have a typo in it. Everything else is still where you left it.",
  backToHome: "Back to home",
  errorTitle: "Something went wrong on our side.",
  errorBody:
    "This is not a problem with your account or anything you did. Try again in a moment — if it keeps happening, the fault is ours and we are already seeing it.",

  // ----------------------------------------------------------- home: nav
  homeSignIn: "Sign in",
  homeCreateAccount: "Create account",

  // ---------------------------------------------------------- home: hero
  homeHeroEyebrow: "Synthetic beta · Experimental model",
  homeHeroTitleLead: "Read the football market",
  homeHeroTitleAccent: "before it moves.",
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

  // ----------------------------------------- home: live intelligence preview
  homeLiveEyebrow: "Today, on synthetic data",
  homeLiveTitle: "This is the actual product surface.",
  homeLiveBody:
    "Not a mock-up. These are the same match cards the workspace renders, running on the Phase 1 synthetic feed.",
  homeLiveDisclaimer:
    "Teams and prices are generated. Nothing here refers to a real fixture.",

  // ------------------------------------------ home: probability is not value
  homeProbabilityEyebrow: "The core idea",
  homeProbabilityTitle: "Why probability alone is not enough.",
  homeProbabilityBody:
    "Knowing a team will probably win tells you nothing about whether the price is worth taking. Three separate questions have to stay separate.",
  homeProbabilityOneTitle: "How likely is it?",
  homeProbabilityOneBody:
    "The model's probability for the outcome. This is a belief about the match, and nothing else.",
  homeProbabilityTwoTitle: "What is the market charging?",
  homeProbabilityTwoBody:
    "Convert the price back into a percentage. A price of 1.85 implies roughly 54%, before margin.",
  homeProbabilityThreeTitle: "Is the difference trustworthy?",
  homeProbabilityThreeBody:
    "A gap only counts if the inputs behind it are complete and recent. That is what the quality grade decides.",

  // ------------------------------------------------- home: football workflow
  homeWorkflowEyebrow: "A matchday routine",
  homeWorkflowTitle: "How you would actually use it.",
  homeWorkflowOneTitle: "Open Today",
  homeWorkflowOneBody:
    "One line tells you the strongest opportunity on the card, and how many matches are still waiting on evidence.",
  homeWorkflowTwoTitle: "Scan EDGE",
  homeWorkflowTwoBody:
    "Every tracked selection on one probability axis, ordered by the size of the gap between model and market.",
  homeWorkflowThreeTitle: "Check RADAR",
  homeWorkflowThreeBody:
    "See whether the price has already moved since it opened, and whether that observation is recent enough to trust.",
  homeWorkflowFourTitle: "Open the match",
  homeWorkflowFourBody:
    "Match Intelligence gives the verdict, the reason behind it, and the full trace if you want to audit it.",

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
  footerRights: "AI football market intelligence",
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

  planFreeFor: "For getting oriented",
  planFreePitch: "A clear, honest look at how VELYQ reads a market.",
  planFreeLimit: "Match Intelligence detail is not included",

  planProFor: "For regular analysis",
  planProPitch: "The full picture on every tracked match, every day.",
  planProLimit: "Introductory pricing during the beta",

  planEliteFor: "For power users",
  planElitePitch: "PRO, plus first access to everything we ship next.",
  planEliteLimit: "Customer access only — never administrative",
  // Rendered automatically when a tier's entitlement set adds nothing over
  // the tier below it, so the page can never imply capability it lacks.
  planNoAdditionalAccess:
    "Grants the same intelligence access as the tier below it today",

  // ----------------------------------------------------------------- auth
  authSignInKicker: "Customer access",
  authSignInTitle: "Welcome back.",
  authSignInBody: "Sign in to your football intelligence workspace.",
  authSignInSubmit: "Sign in",
  authSignInError: "Email or password is incorrect. Please try again.",
  authSignInUnavailable:
    "Sign-in is temporarily unavailable. This is not a problem with your details.",
  authSignInFooter: "Your session is held and verified on our servers.",
  authNoAccount: "New to VELYQ?",
  authForgotPassword: "Forgot your password?",

  authSignUpKicker: "Create your account",
  authSignUpTitle: "Create your account.",
  authSignUpBody: "Start free. No card, no commitment.",
  authSignUpSubmit: "Create free account",
  authSignUpError:
    "We could not create the account. Check your details and try again.",
  authSignUpUnavailable:
    "Account creation is temporarily unavailable. Please try again shortly.",
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
  todayKickoffs: "Upcoming kick-offs",
  todayKickoffsEmpty: "No further kick-offs in this window.",

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
  edgeAxisCaption:
    "Model {model} against market {market}. Probability edge {edge}.",

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

  // ------------------------------------------------------ admin console
  //
  // Platform operations, not football intelligence. Technical nouns that
  // Greek operators use in English — provider, trace, audit — are kept in
  // English rather than forced into awkward Greek.
  adminConsoleName: "Operations",
  adminNavOverview: "Overview",
  adminNavGroupOperations: "Operations",
  adminNavGroupIntelligence: "Intelligence",
  adminNavGroupGovernance: "Governance",
  adminNavProviderRuns: "Provider runs",
  adminNavPredictions: "Prediction traces",
  adminNavScores: "EDGE / RADAR scores",
  adminNavAudit: "Audit log",
  adminNavLabel: "Admin navigation",
  adminServerAuthorized: "Server authorized",
  adminReadOnly: "Read only",
  adminGoverned: "Governed",
  adminSyntheticPhase: "Synthetic Phase 1 only",

  adminOverviewKicker: "Platform operations",
  adminOverviewTitle: "Traceability console.",
  adminOverviewBody:
    "Synthetic Phase 1 intelligence, governed from source run through to the customer result.",
  adminRecentRuns: "Recent provider runs",
  adminRunsVisible: "Latest visible page",
  adminDataPolicy: "Data policy",
  adminDataPolicyValue: "Synthetic provenance required",
  adminAccessLevel: "Access",
  adminAccessValue: "Resolved server-side",
  adminOpenAudit: "Open audit log",
  adminInspect: "Inspect",
  adminEmptyRuns: "No provider runs have been recorded yet.",
  adminEmptyBody:
    "This view reads live operational data. Nothing is shown until a run exists.",

  adminColumnSequence: "Sequence",
  adminColumnStatus: "Status",
  adminColumnAccepted: "Accepted",
  adminColumnRejected: "Rejected",
  adminColumnStarted: "Started",
  adminColumnTrace: "Trace",

  adminSignInKicker: "Admin access",
  adminSignInTitle: "Operations access.",
  adminSignInBody:
    "Sign in with your existing identity. Authorization is resolved server-side.",
  adminSignInSubmit: "Continue to operations",
  adminSignInNote: "An admin permission is required after authentication.",
  adminDeniedTitle: "Access denied.",
  adminDeniedBody:
    "Your identity is valid, but the VELYQ admin permission is not assigned to it.",
  adminUnavailableTitle: "Authorization unavailable.",
  adminUnavailableBody:
    "The admin database runtime is not configured, so no data is shown.",

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

  // Abbreviated unit for a difference between two probabilities. Greek
  // financial writing uses «μον.» (μονάδες) where English uses "pp".
  unitPercentagePoints: "pp",

  // ---------------------------------------------------------- selections
  selectionHome: "Home",
  selectionDraw: "Draw",
  selectionAway: "Away",

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
  brandTagline: "Ανάλυση ποδοσφαίρου",
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
  navSkipToContent: "Μετάβαση στο περιεχόμενο",
  navSectionIntelligence: "Ανάλυση",
  adminConsole: "Διαχείριση",
  signOut: "Αποσύνδεση",
  sessionActive: "Ενεργή σύνδεση",
  languageSelector: "Γλώσσα",
  languageSelectorHint: "Διάλεξε γλώσσα",

  syntheticData: "Συνθετικά δεδομένα",
  developmentHeuristic: "Δείκτης υπό ανάπτυξη",
  experimental: "Πειραματικό",
  observableOnly: "Μόνο ό,τι καταγράφεται",
  traceable: "Ιχνηλάσιμο",
  noEvidence: "Χωρίς στοιχεία",
  radarMove: "Καταγράφηκε κίνηση",
  viewAll: "Δες τα όλα",
  openMatchIntelligence: "Άνοιγμα ανάλυσης αγώνα",
  backToSignIn: "Πίσω στη σύνδεση",
  syntheticEnvironment: "Περιβάλλον beta με συνθετικά δεδομένα",
  researchUse: "Πειραματικό · για έρευνα",

  metaTitle: "VELYQ — Ανάλυση αγορών ποδοσφαίρου",
  metaDescription:
    "Ανάλυση αθλητικών αγορών με ίχνος σε κάθε νούμερο: πιθανότητα μοντέλου απέναντι στις τρέχουσες αποδόσεις και καταγεγραμμένη κίνηση αποδόσεων.",

  customerUnavailable: "Κάτι πήγε στραβά.",
  customerUnavailableBody:
    "Δεν φορτώσαμε τα δεδομένα. Ο λογαριασμός σου είναι μια χαρά — δοκίμασε ξανά σε λίγο.",
  customerLoading: "Φορτώνει η ανάλυσή σου…",
  dataUnavailable: "Δεν υπάρχει κάτι εδώ ακόμα.",
  dataUnavailableBody:
    "Δεν έχει βγει ανάλυση για αυτή την περίοδο. Ό,τι νέο καταγράφεται, εμφανίζεται εδώ.",
  matchNotFound: "Ο αγώνας δεν βρέθηκε.",
  matchNotFoundBody:
    "Ο αγώνας βγήκε εκτός τρέχοντος παραθύρου ή ο σύνδεσμος είναι λάθος.",
  retry: "Δοκίμασε ξανά",
  backToToday: "Επιστροφή στο Σήμερα",
  accessLockedTitle: "Το πακέτο σου δεν το περιλαμβάνει ακόμα.",
  accessLockedBody:
    "Δεν υπάρχει κάποιο πρόβλημα με τον λογαριασμό σου. Αυτή η ενότητα ανοίγει σε ανώτερο πακέτο — όλα τα υπόλοιπα μένουν ακριβώς όπως είναι.",

  notFoundTitle: "Αυτή η σελίδα δεν υπάρχει.",
  notFoundBody:
    "Ο σύνδεσμος μπορεί να είναι παλιός ή η διεύθυνση να έχει κάποιο λάθος. Όλα τα υπόλοιπα είναι στη θέση τους.",
  backToHome: "Επιστροφή στην αρχική",
  errorTitle: "Κάτι πήγε στραβά από τη δική μας πλευρά.",
  errorBody:
    "Δεν φταίει ο λογαριασμός σου ούτε κάτι που έκανες. Δοκίμασε ξανά σε λίγο — αν συνεχιστεί, το πρόβλημα είναι δικό μας και το βλέπουμε ήδη.",

  homeSignIn: "Σύνδεση",
  homeCreateAccount: "Δημιουργία λογαριασμού",

  homeHeroEyebrow: "Beta με συνθετικά δεδομένα · Πειραματικό μοντέλο",
  homeHeroTitleLead: "Διάβασε την αγορά",
  homeHeroTitleAccent: "πριν κινηθεί.",
  homeHeroBody:
    "Το VELYQ βάζει δίπλα δίπλα τι εκτιμά το μοντέλο μας και τι τιμολογεί η αγορά — για να ξεχωρίζεις την πραγματικά λάθος τιμή από την απλή κίνηση αποδόσεων.",
  homeHeroPrimaryCta: "Δημιούργησε δωρεάν λογαριασμό",
  homeHeroSecondaryCta: "Σύνδεση",
  homeHeroPricingCta: "Δες τα πακέτα",
  homeTrustEvidence: "Στοιχεία που ελέγχεις",
  homeTrustNoClaims: "Καμία εγγύηση αποτελέσματος",
  homeTrustBilingual: "Ελληνικά και αγγλικά",

  homePreviewLabel: "Προεπισκόπηση · συνθετικά δεδομένα",
  homePreviewEdge: "Διαφορά πιθανότητας",
  homePreviewModel: "Μοντέλο",
  homePreviewMarket: "Αγορά",
  homePreviewRadar: "Κίνηση αποδόσεων",
  homePreviewQuality: "Ποιότητα",
  homePreviewOpening: "Αρχική",
  homePreviewCurrent: "Τώρα",
  homePreviewTracked: "Σε παρακολούθηση σήμερα",

  homeValueEyebrow: "Ένας χώρος για όλα",
  homeValueTitle: "Από την κίνηση των αποδόσεων στο πραγματικό νόημα.",
  homeValueBody:
    "Πιθανότητα, αξία, στοιχεία, πόσο πρόσφατα και τι λέει το μοντέλο μένουν πάντα ξεχωριστά — για να ξέρεις σε τι πατάει κάθε νούμερο.",
  homeValueOneTitle: "Η πιθανότητα δεν είναι αξία",
  homeValueOneBody:
    "Άλλο πιθανό αποτέλεσμα, άλλο καλοπληρωμένο. Το VELYQ σου δείχνει και τα δύο.",
  homeValueTwoTitle: "Κάθε νούμερο έχει πηγή",
  homeValueTwoBody:
    "Έκδοση μοντέλου, βαθμονόμηση, ποιότητα και χρονικό όριο δεδομένων συνοδεύουν κάθε πρόταση.",
  homeValueThreeTitle: "Η σιωπή είναι κι αυτή απάντηση",
  homeValueThreeBody:
    "Όταν τα στοιχεία δεν φτάνουν, το VELYQ στο λέει αντί να βγάλει σήμα από το πουθενά.",

  homeModulesEyebrow: "Τρεις ενότητες, μία εικόνα",
  homeModulesTitle: "Τι θα βρεις μέσα.",
  homeEdgeLabel: "01 / EDGE",
  homeEdgeTitle: "Αξία, με πλαίσιο.",
  homeEdgeBody:
    "Το EDGE βάζει την πιθανότητα του μοντέλου δίπλα στην πιθανότητα αγοράς. Αν το μοντέλο δίνει 60% και η απόδοση 1,85 βγάζει 54%, αυτές οι έξι μονάδες είναι η αξία — πάντα με δίκαιη απόδοση, αναμενόμενη αξία και τις παραδοχές τους.",
  homeEdgePoint1: "Πιθανότητα μοντέλου έναντι πιθανότητας αγοράς",
  homeEdgePoint2: "Δίκαιη απόδοση και αναμενόμενη αξία",
  homeEdgePoint3: "Βαθμός ποιότητας σε κάθε γραμμή",
  homeRadarLabel: "02 / RADAR",
  homeRadarTitle: "Η κίνηση, καταγεγραμμένη.",
  homeRadarBody:
    "Το RADAR κρατά πού άνοιξε μια απόδοση, πού είναι τώρα και πότε καταγράφηκε τελευταία — για να ξεχωρίζεις την αγορά που όντως κινήθηκε από αυτήν που απλώς δεν έχει ελεγχθεί.",
  homeRadarPoint1: "Από την αρχική στην τρέχουσα απόδοση",
  homeRadarPoint2: "Κατεύθυνση και μέγεθος της κίνησης",
  homeRadarPoint3: "Πότε καταγράφηκε η κάθε τιμή",
  homeMatchLabel: "03 / MATCH INTELLIGENCE",
  homeMatchTitle: "Η πλήρης εικόνα.",
  homeMatchBody:
    "Μία σελίδα ανά αγώνα: πρώτα το συμπέρασμα, από κάτω όλη η διαδρομή — πρόταση και αιτία, μοντέλο έναντι αγοράς, κίνηση αποδόσεων, ποιότητα δεδομένων, ενδεκάδα και πλήρες ίχνος μοντέλου.",
  homeMatchPoint1: "Το συμπέρασμα, μαζί με το γιατί",
  homeMatchPoint2: "Οι έλεγχοι ποιότητας και ενδεκάδας στα φανερά",
  homeMatchPoint3: "Πλήρες, ελέγξιμο ίχνος μοντέλου",

  homeHowEyebrow: "Πώς λειτουργεί",
  homeHowTitle: "Τέσσερα βήματα, χωρίς μαύρα κουτιά.",
  homeHowOneTitle: "Καταγραφή",
  homeHowOneBody:
    "Κάθε απόδοση καταγράφεται όπως ήταν εκείνη τη στιγμή, με ώρα και πηγή.",
  homeHowTwoTitle: "Βαθμολόγηση στοιχείων",
  homeHowTwoBody:
    "Κάθε αγώνας παίρνει βαθμό από Α έως F. Παλιές αποδόσεις, ενδεκάδες που λείπουν και αδύναμες αντιστοιχίσεις φαίνονται, δεν κρύβονται.",
  homeHowThreeTitle: "Εκτίμηση",
  homeHowThreeBody:
    "Ένα πειραματικό μοντέλο βγάζει πιθανότητα, που γίνεται δίκαιη απόδοση και αναμενόμενη αξία για να τη συγκρίνεις με την αγορά.",
  homeHowFourTitle: "Πρόταση ή αναμονή",
  homeHowFourBody:
    "Πρόταση βγαίνει μόνο όταν περάσει ο έλεγχος ποιότητας. Αλλιώς το VELYQ σου λέει ακριβώς τι λείπει.",

  homeWhyEyebrow: "Γιατί VELYQ",
  homeWhyTitle: "Για όσους θέλουν να έχουν δίκιο, όχι τύχη.",
  homeWhyOneTitle: "Ειλικρίνεια στην αβεβαιότητα",
  homeWhyOneBody:
    "Καμία εγγύηση, κανένα σίγουρο. Η βεβαιότητα φαίνεται από τα στοιχεία και τον βαθμό ποιότητας, όχι από μεγάλα λόγια.",
  homeWhyTwoTitle: "Ιχνηλάσιμο από τον σχεδιασμό",
  homeWhyTwoBody:
    "Κάθε νούμερο κουβαλά την έκδοση του μοντέλου, τη βαθμονόμηση και το χρονικό του όριο, ώστε να ελέγξεις μια απόφαση όσο αργά κι αν το θελήσεις.",
  homeWhyThreeTitle: "Διαβάζεται γρήγορα",
  homeWhyThreeBody:
    "Το Σήμερα απαντά πρώτα σε ένα πράγμα: τι αξίζει να προσέξεις σήμερα.",
  homeWhyFourTitle: "Ελληνικά και αγγλικά",
  homeWhyFourBody:
    "Όλο το προϊόν και στις δύο γλώσσες, με ένα κλικ — μαζί με κάθε επεξήγηση και κάθε γνωστοποίηση.",

  homeLiveEyebrow: "Σήμερα, σε συνθετικά δεδομένα",
  homeLiveTitle: "Αυτό είναι το πραγματικό προϊόν.",
  homeLiveBody:
    "Δεν είναι μακέτα. Είναι οι ίδιες κάρτες αγώνων που βλέπεις μέσα στην πλατφόρμα, πάνω στα συνθετικά δεδομένα της Φάσης 1.",
  homeLiveDisclaimer:
    "Οι ομάδες και οι αποδόσεις είναι κατασκευασμένες. Τίποτα εδώ δεν αφορά πραγματικό αγώνα.",

  homeProbabilityEyebrow: "Η βασική ιδέα",
  homeProbabilityTitle: "Γιατί η πιθανότητα από μόνη της δεν φτάνει.",
  homeProbabilityBody:
    "Το ότι μια ομάδα μάλλον θα κερδίσει δεν σου λέει αν η απόδοση αξίζει. Τρία ξεχωριστά ερωτήματα πρέπει να μείνουν ξεχωριστά.",
  homeProbabilityOneTitle: "Πόσο πιθανό είναι;",
  homeProbabilityOneBody:
    "Η πιθανότητα που δίνει το μοντέλο στο αποτέλεσμα. Είναι εκτίμηση για τον αγώνα, τίποτα άλλο.",
  homeProbabilityTwoTitle: "Τι χρεώνει η αγορά;",
  homeProbabilityTwoBody:
    "Η απόδοση ξαναγίνεται ποσοστό. Το 1,85 υπονοεί περίπου 54%, πριν το περιθώριο.",
  homeProbabilityThreeTitle: "Είναι αξιόπιστη η διαφορά;",
  homeProbabilityThreeBody:
    "Η διαφορά μετράει μόνο αν τα δεδομένα πίσω της είναι πλήρη και πρόσφατα. Αυτό κρίνει ο βαθμός ποιότητας.",

  homeWorkflowEyebrow: "Η ρουτίνα της αγωνιστικής",
  homeWorkflowTitle: "Πώς θα το χρησιμοποιούσες στην πράξη.",
  homeWorkflowOneTitle: "Άνοιξε το Σήμερα",
  homeWorkflowOneBody:
    "Μία γραμμή σού λέει την πιο δυνατή ευκαιρία της ημέρας και πόσοι αγώνες περιμένουν ακόμα στοιχεία.",
  homeWorkflowTwoTitle: "Δες το EDGE",
  homeWorkflowTwoBody:
    "Όλες οι επιλογές σε έναν άξονα πιθανότητας, με σειρά από τη μεγαλύτερη διαφορά μοντέλου και αγοράς.",
  homeWorkflowThreeTitle: "Έλεγξε το RADAR",
  homeWorkflowThreeBody:
    "Δες αν η απόδοση έχει ήδη κινηθεί από το άνοιγμα και αν η καταγραφή είναι αρκετά πρόσφατη.",
  homeWorkflowFourTitle: "Μπες στον αγώνα",
  homeWorkflowFourBody:
    "Το Match Intelligence δίνει το συμπέρασμα, την αιτιολόγησή του και όλο το ίχνος αν θες να το ελέγξεις.",

  homePricingEyebrow: "Πακέτα",
  homePricingTitle: "Ξεκίνα δωρεάν. Αναβάθμισε όταν το αξίζει.",
  homePricingBody:
    "Τα πακέτα ορίζουν μόνο τι βλέπεις ως χρήστης. Δεν δίνουν ποτέ δικαιώματα διαχειριστή.",
  homePricingCta: "Δες όλα τα πακέτα",

  homeNoticeTitle: "Λίγα λόγια για τη beta",
  homeNoticeBody:
    "Η Φάση 1 τρέχει με συνθετικά δεδομένα και πειραματικό μοντέλο. Τα EDGE και RADAR είναι δείκτες υπό ανάπτυξη, όχι επικυρωμένα μοντέλα στοιχηματισμού. Το VELYQ είναι εργαλείο ανάλυσης και ενημέρωσης — δεν παρέχει οικονομικές συμβουλές, δεν εγγυάται κανένα αποτέλεσμα και δεν τοποθετεί στοιχήματα. Μην ποντάρεις ποτέ χρήματα που δεν αντέχεις να χάσεις.",
  homeNoticeLink: "Διάβασε για την υπεύθυνη χρήση",

  homeFinalEyebrow: "Ξεκίνα από το σήμα",
  homeFinalTitle: "Ανάλυση με ψυχραιμία, κάθε μέρα.",
  homeFinalBody:
    "Η δωρεάν πρόσβαση είναι ανοιχτή — όλο το Σήμερα, το EDGE και το RADAR, στα ελληνικά ή στα αγγλικά.",
  homeFinalCta: "Δημιούργησε δωρεάν λογαριασμό",

  footerRights: "Ανάλυση αθλητικών αγορών με AI",
  footerCreatedBy: "Created by",
  footerTerms: "Όροι χρήσης",
  footerPrivacy: "Απόρρητο",
  footerResponsibleUse: "Υπεύθυνη χρήση",
  footerSubscriptionTerms: "Όροι συνδρομής",

  pricingKicker: "Πακέτα",
  pricingTitle: "Διάλεξε το πακέτο σου.",
  pricingBody:
    "Τα πακέτα ορίζουν μόνο τι βλέπεις ως χρήστης. Δικαιώματα διαχειριστή δεν δίνονται ποτέ από πακέτο — κρατιούνται ξεχωριστά και ελέγχονται από την πλευρά μας.",
  pricingPerMonth: "τον μήνα",
  pricingFreeWhileBeta: "Δωρεάν όσο τρέχει η beta",
  pricingIntroductory: "Εισαγωγική τιμή",
  pricingMostPopular: "Πιο δημοφιλές",
  pricingCurrentPlan: "Το πακέτο σου",
  pricingBillingPending: "Η χρέωση δεν έχει ενεργοποιηθεί",
  pricingBillingPendingHint:
    "Η πληρωμή θα ανοίξει μόλις στηθεί η χρέωση. Σήμερα δεν χρεώνεσαι.",
  pricingStartCheckout: "Συνέχεια στην πληρωμή",
  pricingIncluded: "Τι περιλαμβάνει",
  pricingLimits: "Καλό να ξέρεις",
  pricingNotAdminTitle: "Το ELITE δεν είναι πρόσβαση διαχειριστή",
  pricingNotAdminBody:
    "Κάθε πακέτο εδώ είναι συνδρομή χρήστη. Τα δικαιώματα διαχειριστή δίνονται ξεχωριστά στη βάση και δεν προκύπτουν ποτέ από πακέτο.",
  pricingFineprint:
    "Τα δεδομένα της Φάσης 1 είναι συνθετικά. Οι προβλέψεις είναι πειραματικές· τα EDGE και RADAR είναι δείκτες υπό ανάπτυξη. Η πληρωμή ανοίγει μόνο όταν ρυθμιστούν εγκεκριμένα Stripe price IDs — μέχρι τότε δεν γίνεται καμία χρέωση.",

  planFreeFor: "Για να πάρεις μια ιδέα",
  planFreePitch: "Καθαρή εικόνα του πώς διαβάζει το VELYQ την αγορά.",
  planFreeLimit: "Χωρίς αναλυτικές σελίδες Match Intelligence",

  planProFor: "Για καθημερινή ανάλυση",
  planProPitch: "Όλη η εικόνα, σε κάθε αγώνα, κάθε μέρα.",
  planProLimit: "Εισαγωγική τιμή όσο τρέχει η beta",

  planEliteFor: "Για προχωρημένους",
  planElitePitch: "Ό,τι έχει το PRO, συν πρώτη πρόσβαση σε ό,τι έρχεται.",
  planEliteLimit: "Μόνο πρόσβαση χρήστη — ποτέ διαχειριστή",
  planNoAdditionalAccess: "Προς το παρόν δίνει ό,τι και το προηγούμενο πακέτο",

  authSignInKicker: "Πρόσβαση χρήστη",
  authSignInTitle: "Καλώς όρισες ξανά.",
  authSignInBody: "Συνδέσου στον χώρο ανάλυσής σου.",
  authSignInSubmit: "Σύνδεση",
  authSignInError: "Λάθος email ή κωδικός. Δοκίμασε ξανά.",
  authSignInUnavailable:
    "Η σύνδεση δεν είναι διαθέσιμη αυτή τη στιγμή. Δεν φταίνε τα στοιχεία σου.",
  authSignInFooter:
    "Η σύνδεσή σου ελέγχεται και προστατεύεται από την πλευρά μας.",
  authNoAccount: "Πρώτη φορά στο VELYQ;",
  authForgotPassword: "Ξέχασες τον κωδικό σου;",

  authSignUpKicker: "Δημιουργία λογαριασμού",
  authSignUpTitle: "Δημιούργησε τον λογαριασμό σου.",
  authSignUpBody: "Ξεκίνα δωρεάν. Χωρίς κάρτα, χωρίς δεσμεύσεις.",
  authSignUpSubmit: "Δημιούργησε δωρεάν λογαριασμό",
  authSignUpError:
    "Δεν έγινε η δημιουργία λογαριασμού. Έλεγξε τα στοιχεία σου και δοκίμασε ξανά.",
  authSignUpUnavailable:
    "Η δημιουργία λογαριασμού δεν είναι διαθέσιμη αυτή τη στιγμή. Δοκίμασε ξανά σύντομα.",
  authSignUpFooter: "Κάθε νέος λογαριασμός ξεκινά στο FREE.",
  authSignUpLegal:
    "Με τη δημιουργία λογαριασμού αποδέχεσαι τους όρους χρήσης και το απόρρητο.",
  authHaveAccount: "Έχεις ήδη λογαριασμό;",

  authForgotKicker: "Ανάκτηση λογαριασμού",
  authForgotTitle: "Επαναφορά κωδικού.",
  authForgotBody: "Γράψε το email σου και σου στέλνουμε σύνδεσμο επαναφοράς.",
  authForgotSubmit: "Στείλε τον σύνδεσμο",
  authForgotError:
    "Η επαναφορά δεν δουλεύει αυτή τη στιγμή. Δοκίμασε ξανά αργότερα.",

  authResetKicker: "Ανάκτηση λογαριασμού",
  authResetTitle: "Όρισε νέο κωδικό.",
  authResetBody: "Διάλεξε νέο κωδικό για τον λογαριασμό σου στο VELYQ.",
  authResetSubmit: "Αποθήκευση κωδικού",
  authResetInvalid: "Ο σύνδεσμος δεν είναι έγκυρος ή έχει λήξει.",

  authEmailLabel: "Email",
  authPasswordLabel: "Κωδικός",
  authNewPasswordLabel: "Νέος κωδικός",
  authPasswordHint: "Τουλάχιστον 8 χαρακτήρες.",
  authShowPassword: "Εμφάνιση κωδικού",
  authHidePassword: "Απόκρυψη κωδικού",

  authAsideTitle: "Διάβασε την αγορά, όχι τον θόρυβο.",
  authAsidePoint1: "Πιθανότητα μοντέλου έναντι τρέχουσας απόδοσης",
  authAsidePoint2: "Από την αρχική στην τρέχουσα απόδοση, με ώρα καταγραφής",
  authAsidePoint3: "Πρόταση μόνο όταν τη στηρίζουν τα στοιχεία",
  authAsideNotice:
    "Synthetic beta · πειραματικό μοντέλο · καμία εγγύηση αποτελέσματος",

  todayKicker: "Κέντρο ελέγχου",
  todayTitle: "Τι αξίζει να προσέξεις σήμερα;",
  todaySnapshot: "Στιγμιότυπο {time} UTC",
  todayLeadStrong:
    "{match} — {selection} στο {odds}. Το μοντέλο δίνει {model}, η αγορά {implied}.",
  todayLeadNone:
    "Τίποτα δεν περνά το όριο EDGE τώρα. Κι αυτό είναι εύρημα, όχι κενό.",
  todayLeadSummary:
    "{waiting} περιμένουν στοιχεία · {blocked} μπλοκαρισμένα από ποιότητα δεδομένων",
  todayTracked: "Αγώνες σε παρακολούθηση",
  todayFreshMoves: "Πρόσφατες κινήσεις αποδόσεων",
  todayQualityWarnings: "Προειδοποιήσεις ποιότητας",
  todayActionable: "Έτοιμα τώρα",
  todayTopEdge: "Κορυφαίες ευκαιρίες EDGE",
  todayMovements: "Τελευταίες κινήσεις αποδόσεων",
  todayViewRadar: "Δες το RADAR",
  todayViewEdge: "Δες το EDGE",
  todayLineupWatch: "Περιμένουν ενδεκάδα",
  todayLineupWatchEmpty: "Κανένας αγώνας δεν περιμένει ενδεκάδα.",
  todayQualityPanel: "Προειδοποιήσεις ποιότητας",
  todayQualityEmpty: "Όλοι οι αγώνες πέρασαν τον έλεγχο ποιότητας.",
  todayNoEdge: "Κανένας αγώνας δεν περνά το όριο EDGE τώρα.",
  todayNoMovement: "Δεν έχει καταγραφεί κίνηση ακόμα.",
  todayFullTime1x2: "Τελικό αποτέλεσμα 1X2",
  todayKickoffs: "Επόμενες σέντρες",
  todayKickoffsEmpty: "Δεν υπάρχουν άλλες σέντρες σε αυτό το διάστημα.",

  edgeKicker: "Μηχανή EDGE",
  edgeTitle: "Αξία, με πλαίσιο.",
  edgeBody:
    "Πού πληρώνει η αγορά πιο γενναιόδωρα από όσο λέει το μοντέλο μας; Θετική διαφορά σημαίνει ακριβώς αυτό — όχι ότι το αποτέλεσμα θα έρθει.",
  edgeCurrentOpportunities: "Τρέχουσες ευκαιρίες",
  edgeTracked: "{count} υπό παρακολούθηση",
  edgeGated: "Περιμένουν στοιχεία",
  edgeGatedNote: "Εδώ δεν βγήκε εκτίμηση. Ο λόγος φαίνεται σε κάθε γραμμή.",
  edgeColumnSelection: "Αγώνας και επιλογή",
  edgeColumnOdds: "Απόδοση",
  edgeColumnModelProbability: "Πιθανότητα μοντέλου",
  edgeColumnImpliedProbability: "Πιθανότητα αγοράς",
  edgeColumnFairOdds: "Δίκαιη απόδοση",
  edgeColumnEdge: "Διαφορά πιθανότητας",
  edgeColumnEv: "Αναμενόμενη αξία",
  edgeColumnQuality: "Ποιότητα",
  edgeEmpty: "Δεν παρακολουθείται καμία ευκαιρία τώρα.",
  edgeSortNote: "Ταξινόμηση κατά διαφορά πιθανότητας, από τη μεγαλύτερη.",
  edgeAxisCaption:
    "Μοντέλο {model} έναντι αγοράς {market}. Διαφορά πιθανότητας {edge}.",

  radarKicker: "RADAR · στοιχεία αγοράς",
  radarTitle: "Κίνηση, όπως καταγράφηκε.",
  radarBody:
    "Μόνο καταγεγραμμένες αποδόσεις. Το VELYQ δεν παρατηρεί, ούτε ισχυρίζεται ότι παρατηρεί, όγκο χρήματος, ύψος στοιχημάτων ή ποιος πόνταρε.",
  radarMarketMovement: "Κίνηση αποδόσεων",
  radarFreshnessAware: "Με ώρα καταγραφής σε κάθε τιμή",
  radarOpening: "Αρχική",
  radarCurrent: "Τρέχουσα",
  radarMovement: "Μεταβολή",
  radarFreshness: "Τελευταία καταγραφή",
  radarHistory: "Ιστορικό αποδόσεων",
  radarNoHistory: "Δεν υπάρχει ιστορικό αποδόσεων",
  radarDrifted: "Η απόδοση ανέβηκε",
  radarShortened: "Η απόδοση έπεσε",
  radarUnchanged: "Η απόδοση δεν άλλαξε",
  radarEmpty: "Δεν υπάρχουν καταγραφές αγοράς ακόμα.",

  matchKicker: "Match Intelligence · ποδόσφαιρο",
  matchVersus: "με",
  matchVerdict: "Συμπέρασμα",
  matchSummary: "Σύνοψη",
  matchRecommendation: "Πρόταση",
  matchMarket: "Μοντέλο έναντι αγοράς",
  matchEdgeBreakdown: "Ανάλυση EDGE",
  matchRadarEvidence: "Στοιχεία RADAR",
  matchQuality: "Ποιότητα δεδομένων",
  matchLineup: "Ενδεκάδα",
  matchWhy: "Γιατί βγήκε αυτό",
  matchTrace: "Στοιχεία ελέγχου",
  matchSelection: "Επιλογή",
  matchCurrentOdds: "Τρέχουσα απόδοση",
  matchModelProbability: "Πιθανότητα μοντέλου",
  matchImpliedProbability: "Πιθανότητα αγοράς",
  matchFairOdds: "Δίκαιη απόδοση",
  matchExpectedValue: "Αναμενόμενη αξία",
  matchProbabilityEdge: "Διαφορά πιθανότητας",
  matchQualityGate: "Έλεγχος ποιότητας",
  matchScoreDefinition: "Τι μετράει ο δείκτης",
  matchGrade: "Βαθμός",
  matchOpeningToCurrent: "Αρχική {opening} → τρέχουσα {current}",
  matchNoMoneyFlow:
    "Πουθενά σε αυτή τη σελίδα δεν γίνεται ισχυρισμός για ροή χρήματος, όγκο στοιχημάτων ή προνομιακή πληροφόρηση.",
  matchPriceEvidence: "Στοιχεία αποδόσεων",
  matchLineupCertainty: "Βεβαιότητα ενδεκάδας",
  matchDataFreshness: "Τελευταία ενημέρωση",
  matchMappingQuality: "Αντιστοίχιση αγοράς",
  matchAvailable: "Διαθέσιμα",
  matchMissing: "Λείπουν",
  matchAllChecksPassed: "Πέρασαν όλοι οι έλεγχοι ποιότητας.",
  matchLineupOfficialBody: "Έχει βγει επίσημη ενδεκάδα.",
  matchLineupMissingBody:
    "Δεν υπάρχει ενδεκάδα, οπότε η πρόταση μένει σε αναμονή.",
  matchLineupOtherBody: "Η ενδεκάδα είναι {state}.",
  matchLineupEvidenceNote: "Η ενδεκάδα είναι στοιχείο, όχι πρόβλεψη.",
  matchModelDisclaimer:
    "Πειραματικό ντετερμινιστικό μοντέλο, όχι επικυρωμένο μοντέλο στοιχηματισμού.",
  matchTraceModel: "Μοντέλο",
  matchTraceCalibration: "Βαθμονόμηση",
  matchTraceScore: "Δείκτης",
  matchTraceQualityPolicy: "Πολιτική ποιότητας",
  matchTracePriceSnapshot: "Στιγμιότυπο απόδοσης",
  matchTraceFeatureCutoff: "Χρονικό όριο δεδομένων",
  matchTraceToggle: "Τεχνικό ίχνος",
  matchTraceHint: "Εκδόσεις και στοιχεία ελέγχου για αυτή την εκτίμηση.",
  matchModelVsMarket: "Μοντέλο {model} · αγορά {implied}",
  matchNoEstimate: "Δεν βγήκε εκτίμηση για αυτόν τον αγώνα.",

  accountKicker: "Λογαριασμός",
  accountTitle: "Ο λογαριασμός σου.",
  accountBody: "Το πακέτο σου, η πρόσβασή σου και η γλώσσα σου, όλα εδώ.",
  accountSignedInAs: "Συνδεδεμένος ως",
  accountPlan: "Πακέτο",
  accountPlanNote: "Η πρόσβαση ελέγχεται από την πλευρά μας σε κάθε αίτημα.",
  accountSubscription: "Συνδρομή",
  accountStatus: "Κατάσταση",
  accountStatusNone: "Χωρίς συνδρομή",
  accountStatusActive: "Ενεργή",
  accountStatusTrialing: "Δοκιμαστική περίοδος",
  accountStatusPastDue: "Καθυστερημένη πληρωμή",
  accountStatusCanceled: "Ακυρωμένη",
  accountStatusUnpaid: "Απλήρωτη",
  accountStatusIncomplete: "Μη ολοκληρωμένη",
  accountStatusIncompleteExpired: "Έληξε πριν ολοκληρωθεί",
  accountEntitlements: "Τι περιλαμβάνει το πακέτο σου",
  accountBilling: "Χρέωση",
  accountBillingInactive:
    "Η χρέωση δεν είναι ενεργή στη beta, οπότε δεν χρεώνεσαι. Η δωρεάν πρόσβασή σου δουλεύει κανονικά.",
  accountManageBilling: "Διαχείριση χρέωσης",
  accountUpgrade: "Δες τα πακέτα",
  accountLanguage: "Γλώσσα",
  accountLanguageBody: "Η γλώσσα αποθηκεύεται σε αυτή τη συσκευή.",
  accountSecurity: "Ασφάλεια",
  accountSecurityBody:
    "Οι συνδέσεις σου φυλάσσονται από την πλευρά μας. Κάνε αποσύνδεση για να κλείσεις τη σύνδεση σε αυτή τη συσκευή.",
  accountChangePassword: "Άλλαξε τον κωδικό σου",
  accountAdminNote:
    "Η πρόσβαση διαχειριστή δίνεται από τη βάση δεδομένων και δεν έχει καμία σχέση με το πακέτο σου.",
  accountEnvironment: "Περιβάλλον",

  entitlementTodayView: "Το Σήμερα",
  entitlementEdgePreview: "Προεπισκόπηση EDGE",
  entitlementEdgeFull: "Πλήρης πίνακας EDGE",
  entitlementRadarPreview: "Προεπισκόπηση RADAR",
  entitlementRadarFull: "Πλήρη στοιχεία RADAR",
  entitlementMatchDetail: "Σελίδες Match Intelligence",

  legalKicker: "Δημόσια ενημέρωση",
  termsTitle: "Όροι χρήσης",
  termsBody1:
    "Το VELYQ παρέχει ανάλυση αθλητικών αγορών για ενημέρωση και έρευνα. Η Φάση 1 τρέχει με συνθετικά δεδομένα και πειραματικά μοντέλα.",
  termsBody2:
    "Το κείμενο είναι προσχέδιο και χρειάζεται νομικό έλεγχο πριν από εμπορική διάθεση. Το VELYQ δεν παρέχει οικονομικές συμβουλές, δεν εγγυάται αποτελέσματα και δεν εκτελεί στοιχήματα.",
  privacyTitle: "Απόρρητο",
  privacyBody1:
    "Το VELYQ επεξεργάζεται όσα δεδομένα λογαριασμού και χρήσης χρειάζονται για να σε ταυτοποιήσει, να λειτουργήσει το προϊόν και να μείνει ασφαλής η υπηρεσία. Δεν κρατάμε στοιχεία κάρτας· τις πληρωμές τις χειρίζεται η Stripe.",
  privacyBody2:
    "Το κείμενο είναι προσχέδιο και χρειάζεται νομικό έλεγχο για κάθε χώρα λειτουργίας.",
  responsibleUseTitle: "Υπεύθυνη χρήση",
  responsibleUseHeading: "Χρησιμοποίησέ το υπεύθυνα.",
  responsibleUseBody1:
    "Το VELYQ δεν είναι σύστημα στοιχηματισμού. Δεν εκτελεί στοιχήματα και δεν υπόσχεται κέρδος. Οι προβλέψεις είναι πειραματικές και τα EDGE και RADAR είναι δείκτες υπό ανάπτυξη πάνω σε συνθετικά δεδομένα της Φάσης 1.",
  responsibleUseBody2:
    "Μην ποντάρεις ποτέ χρήματα που δεν αντέχεις να χάσεις. Αν ο τζόγος επηρεάζει τη ζωή σου, ζήτησε βοήθεια από αδειοδοτημένη υπηρεσία στη χώρα σου. Το κείμενο είναι προσχέδιο και χρειάζεται νομικό έλεγχο.",
  subscriptionTermsTitle: "Όροι συνδρομής",
  subscriptionBody1:
    "Μόλις ενεργοποιηθούν, τα επί πληρωμή πακέτα χρεώνονται μέσω Stripe Checkout και τα διαχειρίζεσαι από το Stripe Billing Portal. Από εκεί γίνεται και η ακύρωση, που ισχύει για την περίοδο χρέωσης που βλέπεις εκείνη τη στιγμή.",
  subscriptionBody2:
    "Η πολιτική επιστροφών και οι τελικοί εμπορικοί όροι θέλουν έγκριση από τον ιδιοκτήτη και νομικό έλεγχο πριν από κάθε πραγματική χρέωση.",

  adminConsoleName: "Λειτουργία",
  adminNavOverview: "Επισκόπηση",
  adminNavGroupOperations: "Λειτουργία",
  adminNavGroupIntelligence: "Ανάλυση",
  adminNavGroupGovernance: "Έλεγχος",
  adminNavProviderRuns: "Εκτελέσεις παρόχων",
  adminNavPredictions: "Ίχνη προβλέψεων",
  adminNavScores: "Δείκτες EDGE / RADAR",
  adminNavAudit: "Αρχείο ελέγχου",
  adminNavLabel: "Πλοήγηση διαχείρισης",
  adminServerAuthorized: "Εξουσιοδοτημένη πρόσβαση",
  adminReadOnly: "Μόνο ανάγνωση",
  adminGoverned: "Με έλεγχο",
  adminSyntheticPhase: "Μόνο συνθετικά δεδομένα Φάσης 1",

  adminOverviewKicker: "Λειτουργία πλατφόρμας",
  adminOverviewTitle: "Κονσόλα ιχνηλασιμότητας.",
  adminOverviewBody:
    "Συνθετικά δεδομένα Φάσης 1, με έλεγχο από την εκτέλεση του παρόχου μέχρι το αποτέλεσμα που βλέπει ο πελάτης.",
  adminRecentRuns: "Πρόσφατες εκτελέσεις παρόχων",
  adminRunsVisible: "Τελευταία σελίδα",
  adminDataPolicy: "Πολιτική δεδομένων",
  adminDataPolicyValue: "Απαιτείται συνθετική προέλευση",
  adminAccessLevel: "Πρόσβαση",
  adminAccessValue: "Ελέγχεται στον server",
  adminOpenAudit: "Άνοιγμα αρχείου ελέγχου",
  adminInspect: "Άνοιγμα",
  adminEmptyRuns: "Δεν έχει καταγραφεί καμία εκτέλεση παρόχου ακόμα.",
  adminEmptyBody:
    "Η οθόνη διαβάζει ζωντανά δεδομένα λειτουργίας. Δεν εμφανίζεται τίποτα μέχρι να υπάρξει εκτέλεση.",

  adminColumnSequence: "Ακολουθία",
  adminColumnStatus: "Κατάσταση",
  adminColumnAccepted: "Δεκτά",
  adminColumnRejected: "Απορρίφθηκαν",
  adminColumnStarted: "Έναρξη",
  adminColumnTrace: "Ίχνος",

  adminSignInKicker: "Πρόσβαση διαχειριστή",
  adminSignInTitle: "Πρόσβαση λειτουργίας.",
  adminSignInBody:
    "Συνδέσου με τα στοιχεία σου. Τα δικαιώματα ελέγχονται στον server.",
  adminSignInSubmit: "Είσοδος",
  adminSignInNote: "Μετά τη σύνδεση απαιτείται δικαίωμα διαχειριστή.",
  adminDeniedTitle: "Δεν επιτρέπεται η πρόσβαση.",
  adminDeniedBody:
    "Τα στοιχεία σου είναι έγκυρα, αλλά δεν σου έχει δοθεί δικαίωμα διαχειριστή στο VELYQ.",
  adminUnavailableTitle: "Η εξουσιοδότηση δεν είναι διαθέσιμη.",
  adminUnavailableBody:
    "Δεν έχει ρυθμιστεί η βάση δεδομένων διαχείρισης, οπότε δεν εμφανίζονται δεδομένα.",

  explainEdgeTitle: "Τι είναι το EDGE;",
  explainEdgeBody:
    "Το EDGE συγκρίνει την πιθανότητα του μοντέλου με την πιθανότητα αγοράς. Θετική διαφορά σημαίνει ότι η απόδοση φαίνεται γενναιόδωρη σε σχέση με το μοντέλο — όχι ότι το αποτέλεσμα θα έρθει.",
  explainEvTitle: "Τι είναι η αναμενόμενη αξία;",
  explainEvBody:
    "Η αναμενόμενη αξία δείχνει τι θα έβγαινε κατά μέσο όρο ανά ευρώ, αν η πιθανότητα του μοντέλου ήταν σωστή και η ίδια κατάσταση επαναλαμβανόταν πολλές φορές. Είναι τρόπος να συγκρίνεις αποδόσεις, όχι πρόβλεψη κέρδους.",
  explainImpliedTitle: "Τι είναι η πιθανότητα αγοράς;",
  explainImpliedBody:
    "Είναι η απόδοση γυρισμένη σε ποσοστό. Απόδοση 2,00 βγάζει 50%, πριν αφαιρεθεί το περιθώριο του πράκτορα.",
  explainFairOddsTitle: "Τι είναι η δίκαιη απόδοση;",
  explainFairOddsBody:
    "Δίκαιη απόδοση είναι η απόδοση που θα ταίριαζε ακριβώς στην πιθανότητα του μοντέλου. Από τη σύγκρισή της με την αγορά βγαίνει η αξία.",
  explainRadarTitle: "Τι παρατηρεί το RADAR;",
  explainRadarBody:
    "Το RADAR κρατά την αρχική και την τρέχουσα απόδοση μιας επιλογής, μαζί με το πότε καταγράφηκε η καθεμία. Αναφέρει μόνο κίνηση — δεν παρατηρεί όγκο στοιχημάτων, ροή χρήματος ή ποιος πόνταρε.",
  explainQualityTitle: "Τι είναι ο βαθμός ποιότητας;",
  explainQualityBody:
    "Κάθε αγώνας παίρνει βαθμό από Α έως F, ανάλογα με το πόσο πλήρη και πόσο πρόσφατα είναι τα δεδομένα του. Χαμηλός βαθμός σημαίνει ότι η πρόταση μπλοκάρεται ή θέλει επιπλέον προσοχή.",
  explainFreshnessTitle: "Πόσο πρόσφατη είναι μια απόδοση;",
  explainFreshnessBody:
    "Δείχνει πότε καταγράφηκε τελευταία φορά η απόδοση. Μια παλιά καταγραφή μπορεί να μη δείχνει πια την αγορά.",

  recStrongEdge: "Ισχυρή αξία",
  recStrongEdgeBody:
    "Η πιθανότητα του μοντέλου είναι αισθητά πάνω από την πιθανότητα αγοράς και ο έλεγχος ποιότητας πέρασε.",
  recWait: "Αναμονή",
  recWaitBody:
    "Τα στοιχεία δεν φτάνουν το όριο. Αξίζει παρακολούθηση, όχι κίνηση.",
  recWaitForLineup: "Χρειάζεται επιβεβαίωση ενδεκάδας",
  recWaitForLineupBody:
    "Η πρόταση μένει σε αναμονή μέχρι να βγει η επίσημη ενδεκάδα, γιατί μια αλλαγή τελευταίας στιγμής αλλάζει αισθητά την εκτίμηση.",
  recNoBet: "Χωρίς πρόταση",
  recNoBetBody:
    "Στην τρέχουσα απόδοση δεν φαίνεται καμία αξία. Η ειλικρινής απάντηση είναι να το προσπεράσεις.",
  recInsufficientData: "Δεν υπάρχουν αρκετά δεδομένα",
  recInsufficientDataBody:
    "Λείπουν αποδόσεις ή κάλυψη, οπότε δεν βγήκε εκτίμηση. Το VELYQ δεν μαντεύει.",
  recEdgeDisappeared: "Η ευκαιρία δεν ισχύει πλέον",
  recEdgeDisappearedBody:
    "Η αξία που υπήρχε δεν φαίνεται πια στην τρέχουσα απόδοση — η αγορά αναπροσάρμοσε.",

  unitPercentagePoints: "μον.",

  selectionHome: "Γηπεδούχος",
  selectionDraw: "Ισοπαλία",
  selectionAway: "Φιλοξενούμενος",

  lineupOfficial: "Επίσημη",
  lineupExpected: "Αναμενόμενη",
  lineupMissing: "Δεν ανακοινώθηκε",
  lineupChanged: "Άλλαξε",

  freshnessFresh: "Πρόσφατη",
  freshnessStale: "Παλιά",

  reasonMissingLineup: "Δεν ανακοινώθηκε ενδεκάδα",
  reasonStaleData: "Παλιά καταγραφή",
  reasonMissingPrice: "Χωρίς τρέχουσα απόδοση",
  reasonWaitingForConfirmation: "Περιμένει επιβεβαίωση",
  reasonLowMappingConfidence: "Αβέβαιη αντιστοίχιση αγοράς",
  reasonEdgeDisappeared: "Η ευκαιρία δεν ισχύει πλέον",
  reasonRepriced: "Η αγορά αναπροσάρμοσε",
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
