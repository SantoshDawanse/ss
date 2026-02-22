export interface StudentProgress {
  student_id: string;
  student_name: string;
  subject: string;
  lessons_completed: number;
  quizzes_completed: number;
  average_accuracy: number;
  total_time_spent: number;
  current_streak: number;
  topics_in_progress: string[];
  topics_mastered: string[];
  last_active: string | null;
}

export interface ClassPerformanceReport {
  class_id: string;
  class_name: string;
  subject: string;
  total_students: number;
  active_students: number;
  average_completion_rate: number;
  average_accuracy: number;
  struggling_students: string[];
  top_performers: string[];
}

export interface CurriculumCoverageReport {
  student_id?: string;
  class_id?: string;
  subject: string;
  total_topics: number;
  topics_covered: number;
  topics_mastered: number;
  coverage_percentage: number;
  topic_details: Array<{
    topic_id: string;
    covered: boolean;
    mastered: boolean;
    proficiency: number;
  }>;
}

export interface DashboardData {
  educator_id: string;
  class_ids: string[];
  student_progress: StudentProgress[];
  class_reports: ClassPerformanceReport[];
  coverage_reports: CurriculumCoverageReport[];
}
