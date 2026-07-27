export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  finance_tracker: {
    Tables: {
      disbursements: {
        Row: {
          amount: number;
          created_at: string;
          date_received: string;
          entity: string;
          id: number;
          reason: string | null;
          refunded_from_receipt: number | null;
          updated_at: string;
        };
        Insert: {
          amount: number;
          created_at?: string;
          date_received: string;
          entity: string;
          id?: number;
          reason?: string | null;
          refunded_from_receipt?: number | null;
          updated_at?: string;
        };
        Update: {
          amount?: number;
          created_at?: string;
          date_received?: string;
          entity?: string;
          id?: number;
          reason?: string | null;
          refunded_from_receipt?: number | null;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "disbursements_refunded_from_receipt_fkey";
            columns: ["refunded_from_receipt"];
            isOneToOne: false;
            referencedRelation: "receipts";
            referencedColumns: ["id"];
          },
        ];
      };
      receipts: {
        Row: {
          category: string;
          created_at: string;
          date: string;
          discount: number;
          discount_percentage: number;
          id: number;
          note: string | null;
          price: number;
          store: string;
          updated_at: string;
        };
        Insert: {
          category: string;
          created_at?: string;
          date: string;
          discount?: number;
          discount_percentage?: number;
          id?: number;
          note?: string | null;
          price: number;
          store: string;
          updated_at?: string;
        };
        Update: {
          category?: string;
          created_at?: string;
          date?: string;
          discount?: number;
          discount_percentage?: number;
          id?: number;
          note?: string | null;
          price?: number;
          store?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      [_ in never]: never;
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      blog_views: {
        Row: {
          country: string | null;
          had_access: boolean;
          id: number;
          is_unique_daily: boolean;
          referrer: string | null;
          slug: string;
          viewed_at: string;
          visitor_hash: string;
          was_locked: boolean;
        };
        Insert: {
          country?: string | null;
          had_access: boolean;
          id?: never;
          is_unique_daily: boolean;
          referrer?: string | null;
          slug: string;
          viewed_at?: string;
          visitor_hash: string;
          was_locked: boolean;
        };
        Update: {
          country?: string | null;
          had_access?: boolean;
          id?: never;
          is_unique_daily?: boolean;
          referrer?: string | null;
          slug?: string;
          viewed_at?: string;
          visitor_hash?: string;
          was_locked?: boolean;
        };
        Relationships: [];
      };
      contact_submissions: {
        Row: {
          created_at: string;
          email: string;
          error_message: string | null;
          id: string;
          message: string;
          name: string;
          send_copy: boolean;
          status: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          error_message?: string | null;
          id?: string;
          message: string;
          name: string;
          send_copy?: boolean;
          status: string;
        };
        Update: {
          created_at?: string;
          email?: string;
          error_message?: string | null;
          id?: string;
          message?: string;
          name?: string;
          send_copy?: boolean;
          status?: string;
        };
        Relationships: [];
      };
      joblog_application_events: {
        Row: {
          application_id: number;
          created_at: string;
          event_date: string;
          event_type: string;
          id: number;
          notes: string | null;
        };
        Insert: {
          application_id: number;
          created_at?: string;
          event_date: string;
          event_type: string;
          id?: number;
          notes?: string | null;
        };
        Update: {
          application_id?: number;
          created_at?: string;
          event_date?: string;
          event_type?: string;
          id?: number;
          notes?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "joblog_application_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "joblog_applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "joblog_application_events_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "joblog_applications_with_context";
            referencedColumns: ["id"];
          },
        ];
      };
      joblog_application_responses: {
        Row: {
          application_id: number;
          id: number;
          notes: string | null;
          reuse_type: string;
          written_response_id: number;
        };
        Insert: {
          application_id: number;
          id?: number;
          notes?: string | null;
          reuse_type: string;
          written_response_id: number;
        };
        Update: {
          application_id?: number;
          id?: number;
          notes?: string | null;
          reuse_type?: string;
          written_response_id?: number;
        };
        Relationships: [
          {
            foreignKeyName: "joblog_application_responses_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "joblog_applications";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "joblog_application_responses_application_id_fkey";
            columns: ["application_id"];
            isOneToOne: false;
            referencedRelation: "joblog_applications_with_context";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "joblog_application_responses_written_response_id_fkey";
            columns: ["written_response_id"];
            isOneToOne: false;
            referencedRelation: "joblog_written_responses";
            referencedColumns: ["id"];
          },
        ];
      };
      joblog_applications: {
        Row: {
          application_channel: string;
          company_id: number;
          created_at: string;
          date_applied: string;
          effort_minutes: number | null;
          id: number;
          job_posting_url: string | null;
          notes: string | null;
          resume_alignment: string;
          resume_version_id: number;
          skill_emphasis: string;
          title: string;
        };
        Insert: {
          application_channel: string;
          company_id: number;
          created_at?: string;
          date_applied: string;
          effort_minutes?: number | null;
          id?: number;
          job_posting_url?: string | null;
          notes?: string | null;
          resume_alignment: string;
          resume_version_id: number;
          skill_emphasis: string;
          title: string;
        };
        Update: {
          application_channel?: string;
          company_id?: number;
          created_at?: string;
          date_applied?: string;
          effort_minutes?: number | null;
          id?: number;
          job_posting_url?: string | null;
          notes?: string | null;
          resume_alignment?: string;
          resume_version_id?: number;
          skill_emphasis?: string;
          title?: string;
        };
        Relationships: [
          {
            foreignKeyName: "joblog_applications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "joblog_applications_with_context";
            referencedColumns: ["company_id"];
          },
          {
            foreignKeyName: "joblog_applications_company_id_fkey";
            columns: ["company_id"];
            isOneToOne: false;
            referencedRelation: "joblog_companies";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "joblog_applications_resume_version_id_fkey";
            columns: ["resume_version_id"];
            isOneToOne: false;
            referencedRelation: "joblog_resume_versions";
            referencedColumns: ["id"];
          },
        ];
      };
      joblog_companies: {
        Row: {
          created_at: string;
          field: string;
          id: number;
          name: string;
          notes: string | null;
        };
        Insert: {
          created_at?: string;
          field: string;
          id?: number;
          name: string;
          notes?: string | null;
        };
        Update: {
          created_at?: string;
          field?: string;
          id?: number;
          name?: string;
          notes?: string | null;
        };
        Relationships: [];
      };
      joblog_industries: {
        Row: {
          created_at: string;
          id: number;
          name: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          name: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          name?: string;
        };
        Relationships: [];
      };
      joblog_resume_versions: {
        Row: {
          based_on_git_commit_hash: string | null;
          change_intensity: string;
          change_summary: string;
          created_at: string;
          git_commit_hash: string;
          id: number;
          notes: string | null;
          pdf_compiled_at: string | null;
          pdf_error: string | null;
          pdf_path: string | null;
          pdf_requested_at: string | null;
          pdf_size_bytes: number | null;
          pdf_status: string;
        };
        Insert: {
          based_on_git_commit_hash?: string | null;
          change_intensity?: string;
          change_summary: string;
          created_at?: string;
          git_commit_hash: string;
          id?: number;
          notes?: string | null;
          pdf_compiled_at?: string | null;
          pdf_error?: string | null;
          pdf_path?: string | null;
          pdf_requested_at?: string | null;
          pdf_size_bytes?: number | null;
          pdf_status?: string;
        };
        Update: {
          based_on_git_commit_hash?: string | null;
          change_intensity?: string;
          change_summary?: string;
          created_at?: string;
          git_commit_hash?: string;
          id?: number;
          notes?: string | null;
          pdf_compiled_at?: string | null;
          pdf_error?: string | null;
          pdf_path?: string | null;
          pdf_requested_at?: string | null;
          pdf_size_bytes?: number | null;
          pdf_status?: string;
        };
        Relationships: [];
      };
      joblog_written_responses: {
        Row: {
          created_at: string;
          id: number;
          notes: string | null;
          question_text: string;
          response_text: string;
          strategy: string;
        };
        Insert: {
          created_at?: string;
          id?: number;
          notes?: string | null;
          question_text: string;
          response_text: string;
          strategy: string;
        };
        Update: {
          created_at?: string;
          id?: number;
          notes?: string | null;
          question_text?: string;
          response_text?: string;
          strategy?: string;
        };
        Relationships: [];
      };
    };
    Views: {
      blog_site_daily: {
        Row: {
          day: string | null;
          total_views: number | null;
          unique_visitors: number | null;
        };
        Relationships: [];
      };
      blog_view_daily: {
        Row: {
          day: string | null;
          slug: string | null;
          total_views: number | null;
          unique_views: number | null;
        };
        Relationships: [];
      };
      joblog_applications_with_context: {
        Row: {
          application_channel: string | null;
          company_field: string | null;
          company_id: number | null;
          company_name: string | null;
          date_applied: string | null;
          effort_minutes: number | null;
          id: number | null;
          latest_event_date: string | null;
          latest_event_type: string | null;
          resume_alignment: string | null;
          resume_change_summary: string | null;
          resume_commit_hash: string | null;
          skill_emphasis: string | null;
          title: string | null;
        };
        Relationships: [];
      };
    };
    Functions: {
      joblog_analytics_overview: {
        Args: { advanced_events: string[] };
        Returns: Json;
      };
      joblog_attach_response: {
        Args: {
          p_application_id: number;
          p_new_question_text?: string;
          p_new_response_notes?: string;
          p_new_response_text?: string;
          p_new_strategy?: string;
          p_notes?: string;
          p_reuse_type: string;
          p_written_response_id?: number;
        };
        Returns: number;
      };
      joblog_create_application: {
        Args: {
          p_application_channel: string;
          p_company_field: string;
          p_company_name: string;
          p_date_applied: string;
          p_effort_minutes?: number;
          p_job_posting_url?: string;
          p_notes?: string;
          p_resume_alignment: string;
          p_resume_version_id: number;
          p_skill_emphasis: string;
          p_title: string;
        };
        Returns: number;
      };
      joblog_rename_industry: {
        Args: { p_new_name: string; p_old_name: string };
        Returns: undefined;
      };
      joblog_search_applications: {
        Args: { p_limit?: number; p_offset?: number; p_search?: string };
        Returns: {
          application_channel: string;
          company_field: string;
          company_id: number;
          company_name: string;
          date_applied: string;
          effort_minutes: number;
          id: number;
          latest_event_date: string;
          latest_event_type: string;
          resume_alignment: string;
          resume_change_summary: string;
          resume_commit_hash: string;
          skill_emphasis: string;
          title: string;
          total_count: number;
        }[];
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  finance_tracker: {
    Enums: {},
  },
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
