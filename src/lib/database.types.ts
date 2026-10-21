export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: '14.5';
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          created_at: string;
          event_data: Json | null;
          event_type: string;
          id: string;
          ip_address: unknown;
          member_id: string | null;
          motion_id: string | null;
          user_agent: string | null;
        };
        Insert: {
          created_at?: string;
          event_data?: Json | null;
          event_type: string;
          id?: string;
          ip_address?: unknown;
          member_id?: string | null;
          motion_id?: string | null;
          user_agent?: string | null;
        };
        Update: {
          created_at?: string;
          event_data?: Json | null;
          event_type?: string;
          id?: string;
          ip_address?: unknown;
          member_id?: string | null;
          motion_id?: string | null;
          user_agent?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'audit_log_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      board_settings: {
        Row: {
          id: boolean;
          next_meeting_at: string | null;
          next_meeting_location: string | null;
          updated_at: string;
          updated_by: string | null;
        };
        Insert: {
          id?: boolean;
          next_meeting_at?: string | null;
          next_meeting_location?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Update: {
          id?: boolean;
          next_meeting_at?: string | null;
          next_meeting_location?: string | null;
          updated_at?: string;
          updated_by?: string | null;
        };
        Relationships: [];
      };
      comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          member_id: string | null;
          motion_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          member_id?: string | null;
          motion_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          member_id?: string | null;
          motion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'comments_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'comments_motion_id_fkey';
            columns: ['motion_id'];
            isOneToOne: false;
            referencedRelation: 'motions';
            referencedColumns: ['id'];
          },
        ];
      };
      members: {
        Row: {
          notify_comments: boolean;
          notify_new_motions: boolean;
          notify_results: boolean;
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          role: string;
        };
        Insert: {
          notify_comments?: boolean;
          notify_new_motions?: boolean;
          notify_results?: boolean;
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          role: string;
        };
        Update: {
          notify_comments?: boolean;
          notify_new_motions?: boolean;
          notify_results?: boolean;
          created_at?: string;
          email?: string;
          full_name?: string;
          id?: string;
          is_active?: boolean;
          role?: string;
        };
        Relationships: [];
      };
      motion_attachments: {
        Row: {
          content_type: string;
          file_hash: string;
          file_name: string;
          file_size: number;
          id: string;
          motion_id: string;
          storage_path: string;
          uploaded_at: string;
          uploaded_by: string;
        };
        Insert: {
          content_type: string;
          file_hash: string;
          file_name: string;
          file_size: number;
          id?: string;
          motion_id: string;
          storage_path: string;
          uploaded_at?: string;
          uploaded_by: string;
        };
        Update: {
          content_type?: string;
          file_hash?: string;
          file_name?: string;
          file_size?: number;
          id?: string;
          motion_id?: string;
          storage_path?: string;
          uploaded_at?: string;
          uploaded_by?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'motion_attachments_motion_id_fkey';
            columns: ['motion_id'];
            isOneToOne: false;
            referencedRelation: 'motions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'motion_attachments_uploaded_by_fkey';
            columns: ['uploaded_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      motion_electorate: {
        Row: {
          member_id: string;
          motion_id: string;
        };
        Insert: {
          member_id: string;
          motion_id: string;
        };
        Update: {
          member_id?: string;
          motion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'motion_electorate_motion_id_fkey';
            columns: ['motion_id'];
            isOneToOne: false;
            referencedRelation: 'motions';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'motion_electorate_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      motions: {
        Row: {
          background: string | null;
          deadline_extended_at: string | null;
          deadline_extension_note: string | null;
          electorate_size: number | null;
          in_person_note: string | null;
          in_person_recorded_at: string | null;
          in_person_recorded_by: string | null;
          in_person_result: string | null;
          last_call_sent_at: string | null;
          meeting_date: string | null;
          referral_note: string | null;
          referral_reason: string | null;
          referred_at: string | null;
          referred_by: string | null;
          reminder_24h_sent_at: string | null;
          reminder_final_sent_at: string | null;
          rules: string;
          voting_deadline: string | null;
          voting_period_days: number;
          created_at: string;
          created_by: string;
          decided_at: string | null;
          description: string;
          id: string;
          motion_number: string;
          motion_text_hash: string | null;
          moved_at: string | null;
          moved_by: string | null;
          published_at: string | null;
          ratified_at: string | null;
          ratified_by: string | null;
          result: string | null;
          seconded_at: string | null;
          seconded_by: string | null;
          status: string;
          title: string;
          voting_opened_at: string | null;
          withdrawn_at: string | null;
        };
        Insert: {
          background?: string | null;
          deadline_extended_at?: string | null;
          deadline_extension_note?: string | null;
          electorate_size?: number | null;
          in_person_note?: string | null;
          in_person_recorded_at?: string | null;
          in_person_recorded_by?: string | null;
          in_person_result?: string | null;
          last_call_sent_at?: string | null;
          meeting_date?: string | null;
          referral_note?: string | null;
          referral_reason?: string | null;
          referred_at?: string | null;
          referred_by?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_final_sent_at?: string | null;
          rules?: string;
          voting_deadline?: string | null;
          voting_period_days?: number;
          created_at?: string;
          created_by: string;
          decided_at?: string | null;
          description: string;
          id?: string;
          motion_number: string;
          motion_text_hash?: string | null;
          moved_at?: string | null;
          moved_by?: string | null;
          published_at?: string | null;
          ratified_at?: string | null;
          ratified_by?: string | null;
          result?: string | null;
          seconded_at?: string | null;
          seconded_by?: string | null;
          status?: string;
          title: string;
          voting_opened_at?: string | null;
          withdrawn_at?: string | null;
        };
        Update: {
          background?: string | null;
          deadline_extended_at?: string | null;
          deadline_extension_note?: string | null;
          electorate_size?: number | null;
          in_person_note?: string | null;
          in_person_recorded_at?: string | null;
          in_person_recorded_by?: string | null;
          in_person_result?: string | null;
          last_call_sent_at?: string | null;
          meeting_date?: string | null;
          referral_note?: string | null;
          referral_reason?: string | null;
          referred_at?: string | null;
          referred_by?: string | null;
          reminder_24h_sent_at?: string | null;
          reminder_final_sent_at?: string | null;
          rules?: string;
          voting_deadline?: string | null;
          voting_period_days?: number;
          created_at?: string;
          created_by?: string;
          decided_at?: string | null;
          description?: string;
          id?: string;
          motion_number?: string;
          motion_text_hash?: string | null;
          moved_at?: string | null;
          moved_by?: string | null;
          published_at?: string | null;
          ratified_at?: string | null;
          ratified_by?: string | null;
          result?: string | null;
          seconded_at?: string | null;
          seconded_by?: string | null;
          status?: string;
          title?: string;
          voting_opened_at?: string | null;
          withdrawn_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: 'motions_created_by_fkey';
            columns: ['created_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'motions_moved_by_fkey';
            columns: ['moved_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'motions_ratified_by_fkey';
            columns: ['ratified_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'motions_seconded_by_fkey';
            columns: ['seconded_by'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
        ];
      };
      votes: {
        Row: {
          change_count: number;
          note: string | null;
          reason: string | null;
          updated_at: string | null;
          cast_at: string;
          id: string;
          ip_address: unknown;
          member_id: string;
          motion_hash_at_vote: string;
          motion_id: string;
          user_agent: string | null;
          vote: string;
        };
        Insert: {
          change_count?: number;
          note?: string | null;
          reason?: string | null;
          updated_at?: string | null;
          cast_at?: string;
          id?: string;
          ip_address?: unknown;
          member_id: string;
          motion_hash_at_vote: string;
          motion_id: string;
          user_agent?: string | null;
          vote: string;
        };
        Update: {
          change_count?: number;
          note?: string | null;
          reason?: string | null;
          updated_at?: string | null;
          cast_at?: string;
          id?: string;
          ip_address?: unknown;
          member_id?: string;
          motion_hash_at_vote?: string;
          motion_id?: string;
          user_agent?: string | null;
          vote?: string;
        };
        Relationships: [
          {
            foreignKeyName: 'votes_member_id_fkey';
            columns: ['member_id'];
            isOneToOne: false;
            referencedRelation: 'members';
            referencedColumns: ['id'];
          },
          {
            foreignKeyName: 'votes_motion_id_fkey';
            columns: ['motion_id'];
            isOneToOne: false;
            referencedRelation: 'motions';
            referencedColumns: ['id'];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      admin_transfer_chair: {
        Args: { p_from_member_id: string; p_to_member_id: string };
        Returns: undefined;
      };
      vote_cast_ballot: {
        Args: {
          p_choice: string;
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_note?: string | null;
          p_reason?: string | null;
          p_user_agent?: string | null;
        };
        Returns: Json;
      };
      vote_claim_reminders: {
        Args: never;
        Returns: { r_kind: string; r_motion_id: string }[];
      };
      vote_close_expired: {
        Args: never;
        Returns: { r_motion_id: string; r_outcome: string; r_reason: string | null }[];
      };
      vote_extend_deadline: {
        Args: {
          p_days: number;
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_note: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_mark_call: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_move_motion: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_publish_motion: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_ratify: {
        Args: {
          p_ip?: unknown;
          p_meeting_date: string;
          p_member_id: string;
          p_motion_ids: string[];
          p_user_agent?: string | null;
        };
        Returns: number;
      };
      vote_record_in_person: {
        Args: {
          p_ip?: unknown;
          p_meeting_date: string;
          p_member_id: string;
          p_motion_id: string;
          p_note?: string | null;
          p_result: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_refer_motion: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_note: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_second_motion: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_user_agent?: string | null;
        };
        Returns: string;
      };
      vote_withdraw_motion: {
        Args: {
          p_ip?: unknown;
          p_member_id: string;
          p_motion_id: string;
          p_user_agent?: string | null;
        };
        Returns: string;
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

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, 'public'>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Views'])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema['Tables'] & DefaultSchema['Views'])
    ? (DefaultSchema['Tables'] & DefaultSchema['Views'])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema['Tables']
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables']
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions['schema']]['Tables'][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema['Tables']
    ? DefaultSchema['Tables'][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema['Enums']
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums']
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions['schema']]['Enums'][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema['Enums']
    ? DefaultSchema['Enums'][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema['CompositeTypes']
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes']
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions['schema']]['CompositeTypes'][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema['CompositeTypes']
    ? DefaultSchema['CompositeTypes'][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
