// The answers the 2027 application form added, in the shape register and
// updateMyRegistration take. Spread into a fixture to make it a valid input.
export const applicationAnswers = {
  isGtStudent: true,
  isDsgtMember: false,
  attendedHacklyticsBefore: false,
  usCitizen: "Yes" as const,
  travelReimbursement: false,
  travelFromCity: "Atlanta",
  travelFromState: "GA",
  travelFromCountry: "United States",
  travelDistance: "I'm already in Atlanta" as const,
  travelMethod: "Walk or transit" as const,
  techJourney: "My first hackathon. I have coded for two years.",
  helpfulFeedback: "Ask for help sooner. It made me a better teammate.",
  trackInterest: "Not sure yet",
  dreamBuild: "A tool that finds study spots with open seats.",
  referralSource: "A friend" as const,
  ramadanFasting: "No" as const,
  excitement: 8,
  // A resume is required; a link satisfies it without a stored upload.
  resumeUrl: "https://example.com/resume.pdf",
};
