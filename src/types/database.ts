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
        };
        Insert: {
          amount: number;
          created_at?: string;
          date_received: string;
          entity: string;
          id?: number;
          reason?: string | null;
          refunded_from_receipt?: number | null;
        };
        Update: {
          amount?: number;
          created_at?: string;
          date_received?: string;
          entity?: string;
          id?: number;
          reason?: string | null;
          refunded_from_receipt?: number | null;
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
