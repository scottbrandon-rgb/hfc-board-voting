export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
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
          {
            foreignKeyName: 'audit_log_motion_id_fkey';
            columns: ['motion_id'];
            isOneToOne: false;
            referencedRelation: 'motions';
            referencedColumns: ['id'];
          },
        ];
      };
      comments: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          member_id: string;
          motion_id: string;
        };
        Insert: {
          body: string;
          created_at?: string;
          id?: string;
          member_id: string;
          motion_id: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          member_id?: string;
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
          created_at: string;
          email: string;
          full_name: string;
          id: string;
          is_active: boolean;
          role: string;
        };
        Insert: {
          created_at?: string;
          email: string;
          full_name: string;
          id?: string;
          is_active?: boolean;
          role: string;
        };
        Update: {
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
      motions: {
        Row: {
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
        };
        Insert: {
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
        };
        Update: {
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
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
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

export const Constants = {
  public: {
    Enums: {},
  },
} as const;
