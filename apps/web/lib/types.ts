export type SavedStatus = "saved" | "applied" | "interviewing" | "offer" | "rejected";

export type User = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  onboarding_completed: boolean;
};

export type TokenPair = {
  access_token: string;
  refresh_token: string;
  token_type: string;
  user: User;
};

export type UserProfile = {
  user_id: number;
  email: string;
  full_name: string;
  role: string;
  headline: string;
  country: string;
  preferred_countries: string[];
  cities: string[];
  experience_level: string;
  years_experience: number;
  preferred_roles: string[];
  technologies: string[];
  languages: string[];
  salary_expectation: string;
  salary_min?: number | null;
  salary_max?: number | null;
  salary_currency?: string;
  visa_required: boolean;
  remote_preference: "any" | "remote" | "hybrid" | "onsite";
  onboarding_completed: boolean;
  updated_at?: string;
};

export type CVParsedData = {
  summary: string;
  skills: string[];
  languages: string[];
  years_experience: number;
  experience_level: string;
  suggested_roles: string[];
};

export type CVItem = {
  id: number;
  filename: string;
  mime_type: string;
  file_size: number;
  is_primary: boolean;
  encrypted: boolean;
  created_at: string;
  parsed: CVParsedData;
};

export type JobItem = {
  id: number;
  title: string;
  company: string;
  location: string;
  country: string;
  city: string;
  remote_mode: string;
  contract_type?: string;
  experience_level?: string;
  salary_text?: string;
  skills: string[];
  source: string;
  apply_url: string;
  posted_at: string;
  score: number | null;
  matched_skills?: string[];
  missing_skills?: string[];
  is_saved: boolean;
  saved_status?: SavedStatus | null;
};

export type JobListResponse = {
  items: JobItem[];
  total: number;
  page: number;
  page_size: number;
  total_pages: number;
  available_sources: string[];
  available_countries: string[];
};

export type JobMatchBreakdown = {
  score: number;
  skill_score: number;
  semantic_score: number;
  experience_score: number;
  matched_skills: string[];
  strengths: string[];
  missing_skills: string[];
  action_items: string[];
  recommendation: string;
};

export type JobDetail = JobItem & {
  description: string;
  match: JobMatchBreakdown | null;
  saved: {
    status: SavedStatus;
    notes: string;
    applied_at: string | null;
  } | null;
};

export type JobMatchItem = {
  job_id: number;
  title: string;
  company: string;
  location: string;
  country: string;
  city: string;
  remote_mode: string;
  source: string;
  apply_url: string;
  posted_at: string;
  salary_text?: string;
  is_saved: boolean;
  score: number;
  skill_score: number;
  semantic_score: number;
  experience_score: number;
  matched_skills: string[];
  strengths: string[];
  missing_skills: string[];
  action_items: string[];
  recommendation: string;
};

export type SavedJobItem = {
  id: number;
  job_id: number;
  status: SavedStatus;
  notes: string;
  applied_at: string | null;
  created_at: string;
  updated_at: string;
  job: {
    id: number;
    title: string;
    company: string;
    location: string;
    country?: string;
    city?: string;
    remote_mode: string;
    source: string;
    apply_url: string;
    salary_text?: string;
    posted_at: string;
    score: number | null;
  };
};

export type ChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  job_id: number | null;
  created_at: string;
};

export type InsightsResponse = {
  ats_readiness_score: number;
  jobs_analyzed: number;
  cv_skills_count: number;
  top_missing_skills: Array<{ skill: string; demand_count: number; impact: number }>;
  top_strengths: Array<{ skill: string; matched_count: number }>;
  market_skill_demand: Array<{ skill: string; demand_count: number; in_cv: boolean }>;
  recommendations: string[];
};

export type AnalyticsOverview = {
  kpis: {
    total_jobs: number;
    jobs_last_24h: number;
    average_match_score: number;
    high_match_jobs: number;
    saved_count: number;
    applied_count: number;
    digests_sent: number;
  };
  score_distribution: Array<{ bucket: string; count: number }>;
  jobs_by_source: Array<{ source: string; count: number }>;
  jobs_by_remote_mode: Array<{ mode: string; count: number }>;
  top_market_skills: Array<{ skill: string; count: number; matched: boolean }>;
  application_funnel: Array<{ stage: string; count: number }>;
};

export type EmailSettings = {
  digest_enabled: boolean;
  frequency: "daily" | "weekdays" | "weekly";
  send_hour: number;
  timezone: string;
  min_match_score: number;
  max_jobs_per_email: number;
  subject_template: string;
  recipient_email: string;
  last_sent_at?: string | null;
  updated_at?: string;
};

export type EmailLog = {
  id: number;
  recipient_email: string;
  subject: string;
  job_count: number;
  status: string;
  provider: string;
  error_message: string;
  sent_at: string;
};

export type AdminStatus = {
  services: {
    api: { status: string };
    database: { status: string; dialect?: string };
    ai_engine: { status: string; llm_mode?: string };
    redis: { status: string; queue_depth?: number };
  };
  metrics: {
    total_jobs: number;
    total_users: number;
    recent_failures: number;
  };
  sources: Array<{
    id: string;
    name: string;
    type: string;
    requires_key: boolean;
    configured: boolean;
  }>;
  recent_runs: Array<{
    id: number;
    source: string;
    backend: string;
    status: string;
    jobs_fetched: number;
    jobs_upserted: number;
    duration_ms: number;
    error_message: string;
    started_at: string;
  }>;
};
