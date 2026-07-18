export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          value: string
        }
        Insert: {
          key: string
          value: string
        }
        Update: {
          key?: string
          value?: string
        }
        Relationships: []
      }
      blocked_users: {
        Row: {
          blocked_id: string
          blocker_id: string
          created_at: string
          id: string
        }
        Insert: {
          blocked_id: string
          blocker_id: string
          created_at?: string
          id?: string
        }
        Update: {
          blocked_id?: string
          blocker_id?: string
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      conversation_participants: {
        Row: {
          cleared_at: string | null
          conversation_id: string
          id: string
          joined_at: string | null
          user_id: string
        }
        Insert: {
          cleared_at?: string | null
          conversation_id: string
          id?: string
          joined_at?: string | null
          user_id: string
        }
        Update: {
          cleared_at?: string | null
          conversation_id?: string
          id?: string
          joined_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversation_participants_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          created_at: string | null
          dm_pair_key: string | null
          id: string
          team_id: string | null
          type: string
        }
        Insert: {
          created_at?: string | null
          dm_pair_key?: string | null
          id?: string
          team_id?: string | null
          type: string
        }
        Update: {
          created_at?: string | null
          dm_pair_key?: string | null
          id?: string
          team_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      feedback: {
        Row: {
          created_at: string
          id: string
          message: string
          type: string
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          message: string
          type: string
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          message?: string
          type?: string
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      friend_requests: {
        Row: {
          created_at: string | null
          id: string
          receiver_id: string
          sender_id: string
          status: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          receiver_id: string
          sender_id: string
          status?: string
        }
        Update: {
          created_at?: string | null
          id?: string
          receiver_id?: string
          sender_id?: string
          status?: string
        }
        Relationships: []
      }
      hackathon_posts: {
        Row: {
          content: string
          created_at: string
          hackathon_id: string
          id: string
          is_announcement: boolean
          user_id: string
        }
        Insert: {
          content: string
          created_at?: string
          hackathon_id: string
          id?: string
          is_announcement?: boolean
          user_id: string
        }
        Update: {
          content?: string
          created_at?: string
          hackathon_id?: string
          id?: string
          is_announcement?: boolean
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_posts_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_posts_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_registrations: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          looking_for_team: boolean
          team_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          looking_for_team?: boolean
          team_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          looking_for_team?: boolean
          team_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_registrations_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_registrations_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_registrations_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathon_resources: {
        Row: {
          category: string
          created_at: string
          created_by: string
          hackathon_id: string
          id: string
          title: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by: string
          hackathon_id: string
          id?: string
          title: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string
          hackathon_id?: string
          id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "hackathon_resources_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "hackathon_resources_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      hackathons: {
        Row: {
          banner_url: string | null
          created_at: string | null
          description: string | null
          end_date: string | null
          id: string
          location: string | null
          mode: string | null
          name: string
          organizer_id: string | null
          prize_pool: string | null
          registration_end: string | null
          registration_start: string | null
          registration_status: string | null
          start_date: string | null
          tags: string[] | null
          type: string | null
          website_url: string | null
        }
        Insert: {
          banner_url?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          mode?: string | null
          name: string
          organizer_id?: string | null
          prize_pool?: string | null
          registration_end?: string | null
          registration_start?: string | null
          registration_status?: string | null
          start_date?: string | null
          tags?: string[] | null
          type?: string | null
          website_url?: string | null
        }
        Update: {
          banner_url?: string | null
          created_at?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          location?: string | null
          mode?: string | null
          name?: string
          organizer_id?: string | null
          prize_pool?: string | null
          registration_end?: string | null
          registration_start?: string | null
          registration_status?: string | null
          start_date?: string | null
          tags?: string[] | null
          type?: string | null
          website_url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "hackathons_organizer_id_fkey"
            columns: ["organizer_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_pinned: boolean
          is_read: boolean | null
          mentions: string[] | null
          sender_id: string
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean
          is_read?: boolean | null
          mentions?: string[] | null
          sender_id: string
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_pinned?: boolean
          is_read?: boolean | null
          mentions?: string[] | null
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          link: string | null
          message: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          link?: string | null
          message?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          bio: string | null
          college: string | null
          created_at: string | null
          email: string
          full_name: string | null
          github_stats: Json | null
          github_stats_updated_at: string | null
          github_url: string | null
          hackathon_participations: number | null
          hackathon_wins: number | null
          has_participated_hackathon: boolean | null
          has_won_hackathon: boolean | null
          id: string
          is_available: boolean | null
          is_banned: boolean | null
          last_seen_at: string | null
          linkedin_url: string | null
          onboarding_completed: boolean
          onboarding_nudge_sent_at: string | null
          role: string | null
          skills: string[] | null
        }
        Insert: {
          avatar_url?: string | null
          bio?: string | null
          college?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          github_stats?: Json | null
          github_stats_updated_at?: string | null
          github_url?: string | null
          hackathon_participations?: number | null
          hackathon_wins?: number | null
          has_participated_hackathon?: boolean | null
          has_won_hackathon?: boolean | null
          id: string
          is_available?: boolean | null
          is_banned?: boolean | null
          last_seen_at?: string | null
          linkedin_url?: string | null
          onboarding_completed?: boolean
          onboarding_nudge_sent_at?: string | null
          role?: string | null
          skills?: string[] | null
        }
        Update: {
          avatar_url?: string | null
          bio?: string | null
          college?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          github_stats?: Json | null
          github_stats_updated_at?: string | null
          github_url?: string | null
          hackathon_participations?: number | null
          hackathon_wins?: number | null
          has_participated_hackathon?: boolean | null
          has_won_hackathon?: boolean | null
          id?: string
          is_available?: boolean | null
          is_banned?: boolean | null
          last_seen_at?: string | null
          linkedin_url?: string | null
          onboarding_completed?: boolean
          onboarding_nudge_sent_at?: string | null
          role?: string | null
          skills?: string[] | null
        }
        Relationships: []
      }
      saved_hackathons: {
        Row: {
          created_at: string
          hackathon_id: string
          id: string
          reminder_sent_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          hackathon_id: string
          id?: string
          reminder_sent_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          hackathon_id?: string
          id?: string
          reminder_sent_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "saved_hackathons_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      team_documents: {
        Row: {
          content: string
          id: string
          team_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          content?: string
          id?: string
          team_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          content?: string
          id?: string
          team_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_documents_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: true
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_documents_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_hackathons: {
        Row: {
          created_at: string | null
          hackathon_id: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          hackathon_id: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          hackathon_id?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_hackathons_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_hackathons_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_invites: {
        Row: {
          created_at: string | null
          id: string
          invited_by: string
          invited_user_id: string
          status: string
          team_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          invited_by: string
          invited_user_id: string
          status?: string
          team_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          invited_by?: string
          invited_user_id?: string
          status?: string
          team_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_invited_user_id_fkey"
            columns: ["invited_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_invites_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_join_requests: {
        Row: {
          created_at: string | null
          id: string
          status: string
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          status?: string
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          status?: string
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_join_requests_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_join_requests_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_links: {
        Row: {
          category: string
          created_at: string
          created_by: string | null
          id: string
          team_id: string
          title: string
          url: string
        }
        Insert: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          team_id: string
          title: string
          url: string
        }
        Update: {
          category?: string
          created_at?: string
          created_by?: string | null
          id?: string
          team_id?: string
          title?: string
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_links_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_links_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      team_members: {
        Row: {
          created_at: string | null
          id: string
          project_role: string | null
          role: string | null
          team_id: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          project_role?: string | null
          role?: string | null
          team_id: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          project_role?: string | null
          role?: string | null
          team_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_members_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      team_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          priority: string
          status: string
          team_id: string
          title: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          team_id: string
          title: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          priority?: string
          status?: string
          team_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "team_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "team_tasks_team_id_fkey"
            columns: ["team_id"]
            isOneToOne: false
            referencedRelation: "teams"
            referencedColumns: ["id"]
          },
        ]
      }
      teams: {
        Row: {
          college: string | null
          created_at: string | null
          description: string | null
          hackathon_id: string | null
          hackathon_name: string | null
          id: string
          is_recruiting: boolean | null
          max_members: number | null
          name: string
          owner_id: string
          roles_needed: string[] | null
          skills: string[] | null
        }
        Insert: {
          college?: string | null
          created_at?: string | null
          description?: string | null
          hackathon_id?: string | null
          hackathon_name?: string | null
          id?: string
          is_recruiting?: boolean | null
          max_members?: number | null
          name: string
          owner_id: string
          roles_needed?: string[] | null
          skills?: string[] | null
        }
        Update: {
          college?: string | null
          created_at?: string | null
          description?: string | null
          hackathon_id?: string | null
          hackathon_name?: string | null
          id?: string
          is_recruiting?: boolean | null
          max_members?: number | null
          name?: string
          owner_id?: string
          roles_needed?: string[] | null
          skills?: string[] | null
        }
        Relationships: [
          {
            foreignKeyName: "teams_hackathon_id_fkey"
            columns: ["hackathon_id"]
            isOneToOne: false
            referencedRelation: "hackathons"
            referencedColumns: ["id"]
          },
        ]
      }
      user_reports: {
        Row: {
          created_at: string
          details: string | null
          id: string
          reason: string
          reported_id: string
          reporter_id: string | null
        }
        Insert: {
          created_at?: string
          details?: string | null
          id?: string
          reason: string
          reported_id: string
          reporter_id?: string | null
        }
        Update: {
          created_at?: string
          details?: string | null
          id?: string
          reason?: string
          reported_id?: string
          reporter_id?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      accept_connection_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      accept_team_invite: { Args: { p_invite_id: string }; Returns: string }
      accept_team_join_request: {
        Args: { p_request_id: string }
        Returns: string
      }
      add_user_to_team: {
        Args: { p_role?: string; p_team_id: string; p_user_id: string }
        Returns: undefined
      }
      can_access_conversation: {
        Args: { p_conversation_id: string }
        Returns: boolean
      }
      create_team_with_owner: {
        Args: {
          p_college: string
          p_description: string
          p_hackathon_id: string
          p_hackathon_name: string
          p_max_members: number
          p_name: string
          p_roles_needed: string[]
          p_skills: string[]
        }
        Returns: string
      }
      delete_user_completely: {
        Args: { p_target_user_id: string }
        Returns: undefined
      }
      ensure_team_conversation: { Args: { p_team_id: string }; Returns: string }
      generate_team_invite_token: {
        Args: { p_team_id: string }
        Returns: string
      }
      get_or_create_dm: { Args: { other_user_id: string }; Returns: string }
      get_pending_deadline_reminders: {
        Args: never
        Returns: {
          hackathon_id: string
          hackathon_name: string
          registration_end: string
          saved_id: string
          user_email: string
          user_id: string
          user_name: string
        }[]
      }
      is_admin: { Args: { user_id: string }; Returns: boolean }
      is_conversation_participant: {
        Args: { conv_id: string }
        Returns: boolean
      }
      is_team_member: { Args: { p_team_id: string }; Returns: boolean }
      is_team_owner: { Args: { p_team_id: string }; Returns: boolean }
      join_team_instantly: {
        Args: { p_team_id: string; p_token: string }
        Returns: undefined
      }
      mark_conversation_read: {
        Args: { p_conversation_id: string }
        Returns: undefined
      }
      mark_deadline_reminder_sent: {
        Args: { p_saved_ids: string[] }
        Returns: undefined
      }
      pin_message: { Args: { p_message_id: string }; Returns: undefined }
      reject_team_invite: { Args: { p_invite_id: string }; Returns: undefined }
      request_to_join_team: { Args: { p_team_id: string }; Returns: string }
      send_connection_request: {
        Args: { p_receiver_id: string }
        Returns: string
      }
      send_message: {
        Args: { p_content: string; p_conversation_id: string }
        Returns: string
      }
      send_message_with_mentions: {
        Args: {
          p_content: string
          p_conversation_id: string
          p_mentions?: string[]
        }
        Returns: string
      }
      send_team_invite: {
        Args: { p_invited_user_id: string; p_team_id: string }
        Returns: string
      }
      submit_feedback: {
        Args: { p_message: string; p_type: string }
        Returns: string
      }
      toggle_message_pin: { Args: { p_message_id: string }; Returns: boolean }
      unpin_message: { Args: { p_message_id: string }; Returns: undefined }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
