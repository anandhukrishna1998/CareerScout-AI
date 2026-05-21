export type Job = {
  id: string;
  title: string;
  company: string;
  location: string;
  score?: number;
};

export type UserPreferences = {
  countries: string[];
  cities: string[];
  preferredRoles: string[];
  technologies: string[];
  languages: string[];
  salaryExpectation?: string;
  visaRequired?: boolean;
  remotePreference?: "remote" | "hybrid" | "onsite";
};
