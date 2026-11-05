export type Share = { label: string; value: number };

const byShare = (shares: Share[]) =>
  [...shares].sort((a, b) => b.value - a.value);

export const classYears = byShare([
  { label: "1st year", value: 42.7 },
  { label: "2nd year", value: 27.3 },
  { label: "3rd year", value: 9.68 },
  { label: "4th year", value: 5.14 },
  { label: "5th year+", value: 1.38 },
  { label: "Masters/PhD", value: 13.8 },
]);

export const majors = byShare([
  { label: "Computer Science", value: 60.1 },
  { label: "Industrial Engineering", value: 17.9 },
  { label: "Other Engineering", value: 11.1 },
  { label: "Analytics", value: 3.13 },
  { label: "Mathematics", value: 3.42 },
  { label: "Business Administration", value: 2 },
  { label: "Other", value: 1.1 },
]);
