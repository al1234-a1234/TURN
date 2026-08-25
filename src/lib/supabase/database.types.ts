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
      platform_status: {
        Row: {
          by_user: string | null
          only_row: boolean
          paused: boolean
          reason: string | null
          since: string | null
        }
        Insert: {
          by_user?: string | null
          only_row?: boolean
          paused?: boolean
          reason?: string | null
          since?: string | null
        }
        Update: {
          by_user?: string | null
          only_row?: boolean
          paused?: boolean
          reason?: string | null
          since?: string | null
        }
        Relationships: []
      }
      admin_audit: {
        Row: {
          action: string
          actor: string | null
          at: string
          branch_id: string | null
          detail: Json
          id: string
          reason: string | null
          restaurant_id: string | null
        }
        Insert: {
          action: string
          actor?: string | null
          at?: string
          branch_id?: string | null
          detail?: Json
          id?: string
          reason?: string | null
          restaurant_id?: string | null
        }
        Update: {
          action?: string
          actor?: string | null
          at?: string
          branch_id?: string | null
          detail?: Json
          id?: string
          reason?: string | null
          restaurant_id?: string | null
        }
        Relationships: []
      }
      branch_settings: {
        Row: {
          accepts_reservations: boolean
          accepts_waitlist: boolean
          booking_window_days: number
          branch_id: string
          busy_now: boolean
          charge_customer: boolean
          custom: Json | null
          default_duration_min: number
          grace_period_min: number
          has_inside: boolean
          has_outside: boolean
          manually_closed: boolean
          max_party_size: number
          notification_channels:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          opening_hours: Json | null
          updated_at: string
        }
        Insert: {
          accepts_reservations?: boolean
          accepts_waitlist?: boolean
          booking_window_days?: number
          branch_id: string
          busy_now?: boolean
          charge_customer?: boolean
          custom?: Json | null
          default_duration_min?: number
          grace_period_min?: number
          has_inside?: boolean
          has_outside?: boolean
          manually_closed?: boolean
          max_party_size?: number
          notification_channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          opening_hours?: Json | null
          updated_at?: string
        }
        Update: {
          accepts_reservations?: boolean
          accepts_waitlist?: boolean
          booking_window_days?: number
          branch_id?: string
          busy_now?: boolean
          charge_customer?: boolean
          custom?: Json | null
          default_duration_min?: number
          grace_period_min?: number
          has_inside?: boolean
          has_outside?: boolean
          manually_closed?: boolean
          max_party_size?: number
          notification_channels?:
            | Database["public"]["Enums"]["notification_channel"][]
            | null
          opening_hours?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_settings_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: true
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_zones: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          key: string
          name: string
          name_en: string | null
          sort_order: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          key: string
          name: string
          name_en?: string | null
          sort_order?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          key?: string
          name?: string
          name_en?: string | null
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "branch_zones_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      branches: {
        Row: {
          address: string | null
          city: string | null
          created_at: string
          id: string
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          name_en: string | null
          phone: string | null
          restaurant_id: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          name_en?: string | null
          phone?: string | null
          restaurant_id: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          name_en?: string | null
          phone?: string | null
          restaurant_id?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_restaurant: {
        Row: {
          customer_id: string
          first_seen: string
          is_blocked: boolean
          is_vip: boolean
          last_visit: string | null
          no_shows: number
          note: string | null
          restaurant_id: string
          tags: string[]
          updated_at: string
          visits: number
        }
        Insert: {
          customer_id: string
          first_seen?: string
          is_blocked?: boolean
          is_vip?: boolean
          last_visit?: string | null
          no_shows?: number
          note?: string | null
          restaurant_id: string
          tags?: string[]
          updated_at?: string
          visits?: number
        }
        Update: {
          customer_id?: string
          first_seen?: string
          is_blocked?: boolean
          is_vip?: boolean
          last_visit?: string | null
          no_shows?: number
          note?: string | null
          restaurant_id?: string
          tags?: string[]
          updated_at?: string
          visits?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_restaurant_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_restaurant_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_rewards: {
        Row: {
          armed_at: string | null
          code: string | null
          created_at: string
          created_by: string | null
          customer_id: string
          description: string | null
          expires_at: string | null
          id: string
          kind: string
          redeemed_at: string | null
          restaurant_id: string
          status: string
          title: string
          value: number | null
          value_kind: string
        }
        Insert: {
          armed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id: string
          description?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          redeemed_at?: string | null
          restaurant_id: string
          status?: string
          title: string
          value?: number | null
          value_kind?: string
        }
        Update: {
          armed_at?: string | null
          code?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string
          description?: string | null
          expires_at?: string | null
          id?: string
          kind?: string
          redeemed_at?: string | null
          restaurant_id?: string
          status?: string
          title?: string
          value?: number | null
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_rewards_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_rewards_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_segments: {
        Row: {
          created_at: string
          id: string
          inactive_days: number | null
          max_visits: number | null
          min_visits: number
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          inactive_days?: number | null
          max_visits?: number | null
          min_visits?: number
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          inactive_days?: number | null
          max_visits?: number | null
          min_visits?: number
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_segments_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          created_at: string
          email: string | null
          full_name: string
          id: string
          phone: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          email?: string | null
          full_name: string
          id?: string
          phone: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          phone?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          avg_wait_seconds: number
          branch_id: string
          cancelled_count: number
          inside_count: number
          joined_count: number
          no_show_count: number
          outside_count: number
          peak_hour: number | null
          seated_count: number
          stat_date: string
          updated_at: string
        }
        Insert: {
          avg_wait_seconds?: number
          branch_id: string
          cancelled_count?: number
          inside_count?: number
          joined_count?: number
          no_show_count?: number
          outside_count?: number
          peak_hour?: number | null
          seated_count?: number
          stat_date: string
          updated_at?: string
        }
        Update: {
          avg_wait_seconds?: number
          branch_id?: string
          cancelled_count?: number
          inside_count?: number
          joined_count?: number
          no_show_count?: number
          outside_count?: number
          peak_hour?: number | null
          seated_count?: number
          stat_date?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "daily_stats_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_modules: {
        Row: {
          category: string
          created_at: string
          default_enabled: boolean
          description_ar: string | null
          is_core: boolean
          key: string
          name_ar: string
          sort_order: number
        }
        Insert: {
          category?: string
          created_at?: string
          default_enabled?: boolean
          description_ar?: string | null
          is_core?: boolean
          key: string
          name_ar: string
          sort_order?: number
        }
        Update: {
          category?: string
          created_at?: string
          default_enabled?: boolean
          description_ar?: string | null
          is_core?: boolean
          key?: string
          name_ar?: string
          sort_order?: number
        }
        Relationships: []
      }
      menu_categories: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          name: string
          name_en: string | null
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          name: string
          name_en: string | null
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          name?: string
          name_en?: string | null
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "menu_categories_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_categories_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_items: {
        Row: {
          branch_id: string
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          description_en: string | null
          name_en: string | null
          price: number | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          branch_id: string
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          description_en: string | null
          name_en: string | null
          price?: number | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          branch_id?: string
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          description_en?: string | null
          name_en?: string | null
          price?: number | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "menu_items_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "menu_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "menu_items_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          branch_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at: string
          customer_id: string | null
          delivered: boolean | null
          error: string | null
          id: string
          payload: Json | null
          sent_at: string | null
          template: string
        }
        Insert: {
          branch_id: string
          channel: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          delivered?: boolean | null
          error?: string | null
          id?: string
          payload?: Json | null
          sent_at?: string | null
          template: string
        }
        Update: {
          branch_id?: string
          channel?: Database["public"]["Enums"]["notification_channel"]
          created_at?: string
          customer_id?: string | null
          delivered?: boolean | null
          error?: string | null
          id?: string
          payload?: Json | null
          sent_at?: string | null
          template?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      owner_insights: {
        Row: {
          body: string | null
          created_at: string
          data: Json
          id: string
          is_read: boolean
          kind: string
          restaurant_id: string
          title: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          kind: string
          restaurant_id: string
          title: string
        }
        Update: {
          body?: string | null
          created_at?: string
          data?: Json
          id?: string
          is_read?: boolean
          kind?: string
          restaurant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "owner_insights_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          customer_id: string
          endpoint: string
          id: string
          last_used_at: string | null
          p256dh: string
        }
        Insert: {
          auth: string
          created_at?: string
          customer_id: string
          endpoint: string
          id?: string
          last_used_at?: string | null
          p256dh: string
        }
        Update: {
          auth?: string
          created_at?: string
          customer_id?: string
          endpoint?: string
          id?: string
          last_used_at?: string | null
          p256dh?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
        ]
      }
      rate_limits: {
        Row: {
          count: number
          key: string
          window_start: string
        }
        Insert: {
          count?: number
          key: string
          window_start?: string
        }
        Update: {
          count?: number
          key?: string
          window_start?: string
        }
        Relationships: []
      }
      reservations: {
        Row: {
          branch_id: string
          created_at: string
          customer_id: string
          duration_min: number
          id: string
          notes: string | null
          party_size: number
          reserved_at: string
          status: Database["public"]["Enums"]["reservation_status"]
          table_id: string | null
          time_range: unknown
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          customer_id: string
          duration_min?: number
          id?: string
          notes?: string | null
          party_size: number
          reserved_at: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string | null
          time_range?: unknown
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          customer_id?: string
          duration_min?: number
          id?: string
          notes?: string | null
          party_size?: number
          reserved_at?: string
          status?: Database["public"]["Enums"]["reservation_status"]
          table_id?: string | null
          time_range?: unknown
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "reservations_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reservations_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_features: {
        Row: {
          config: Json
          enabled: boolean
          enabled_at: string | null
          module_key: string
          restaurant_id: string
          updated_at: string
        }
        Insert: {
          config?: Json
          enabled?: boolean
          enabled_at?: string | null
          module_key: string
          restaurant_id: string
          updated_at?: string
        }
        Update: {
          config?: Json
          enabled?: boolean
          enabled_at?: string | null
          module_key?: string
          restaurant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_features_module_key_fkey"
            columns: ["module_key"]
            isOneToOne: false
            referencedRelation: "feature_modules"
            referencedColumns: ["key"]
          },
          {
            foreignKeyName: "restaurant_features_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurant_photos: {
        Row: {
          branch_id: string
          caption: string | null
          created_at: string
          id: string
          restaurant_id: string
          sort_order: number
          url: string
        }
        Insert: {
          branch_id: string
          caption?: string | null
          created_at?: string
          id?: string
          restaurant_id: string
          sort_order?: number
          url: string
        }
        Update: {
          branch_id?: string
          caption?: string | null
          created_at?: string
          id?: string
          restaurant_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
          {
            foreignKeyName: "restaurant_photos_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "restaurant_photos_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      restaurants: {
        Row: {
          claim_code: string | null
          claimed_at: string | null
          cover_url: string | null
          created_at: string
          cuisine: string | null
          cuisine_en: string | null
          description: string | null
          email: string | null
          id: string
          is_active: boolean
          is_canary: boolean
          links: Json
          logo_url: string | null
          name: string
          name_en: string | null
          owner_id: string
          owner_phone: string | null
          owner_username: string | null
          phone: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          claim_code?: string | null
          claimed_at?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          cuisine_en?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_canary?: boolean
          links?: Json
          logo_url?: string | null
          name: string
          name_en?: string | null
          owner_id: string
          owner_phone?: string | null
          owner_username?: string | null
          phone?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          claim_code?: string | null
          claimed_at?: string | null
          cover_url?: string | null
          created_at?: string
          cuisine?: string | null
          cuisine_en?: string | null
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
          is_canary?: boolean
          links?: Json
          logo_url?: string | null
          name?: string
          name_en?: string | null
          owner_id?: string
          owner_phone?: string | null
          owner_username?: string | null
          phone?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      reviews: {
        Row: {
          branch_id: string | null
          comment: string | null
          created_at: string
          customer_id: string | null
          id: string
          is_published: boolean
          rating: number
          restaurant_id: string
          routed_to_google: boolean
          waitlist_entry_id: string | null
        }
        Insert: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          rating: number
          restaurant_id: string
          routed_to_google?: boolean
          waitlist_entry_id?: string | null
        }
        Update: {
          branch_id?: string | null
          comment?: string | null
          created_at?: string
          customer_id?: string | null
          id?: string
          is_published?: boolean
          rating?: number
          restaurant_id?: string
          routed_to_google?: boolean
          waitlist_entry_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "reviews_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reviews_waitlist_entry_id_fkey"
            columns: ["waitlist_entry_id"]
            isOneToOne: false
            referencedRelation: "waitlist_entries"
            referencedColumns: ["id"]
          },
        ]
      }
      staff: {
        Row: {
          branch_id: string | null
          created_at: string
          id: string
          is_active: boolean
          name: string | null
          permissions: Json
          restaurant_id: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          permissions?: Json
          restaurant_id: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string | null
          permissions?: Json
          restaurant_id?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "staff_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "staff_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      tables: {
        Row: {
          branch_id: string
          created_at: string
          id: string
          is_active: boolean
          label: string
          min_seats: number | null
          seats: number
          sort_order: number | null
          status: Database["public"]["Enums"]["table_status"]
          zone: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          id?: string
          is_active?: boolean
          label: string
          min_seats?: number | null
          seats: number
          sort_order?: number | null
          status?: Database["public"]["Enums"]["table_status"]
          zone?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          id?: string
          is_active?: boolean
          label?: string
          min_seats?: number | null
          seats?: number
          sort_order?: number | null
          status?: Database["public"]["Enums"]["table_status"]
          zone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tables_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      waitlist_entries: {
        Row: {
          branch_id: string
          confirmed_at: string | null
          customer_id: string
          distance_m: number | null
          id: string
          joined_at: string
          notes: string | null
          notified_at: string | null
          party_size: number
          position: number | null
          quoted_wait_min: number | null
          seated_at: string | null
          status: Database["public"]["Enums"]["waitlist_status"]
          table_id: string | null
          updated_at: string
          visit_counted_at: string | null
          zone: string
        }
        Insert: {
          branch_id: string
          confirmed_at?: string | null
          customer_id: string
          distance_m?: number | null
          id?: string
          joined_at?: string
          notes?: string | null
          notified_at?: string | null
          party_size: number
          position?: number | null
          quoted_wait_min?: number | null
          seated_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          table_id?: string | null
          updated_at?: string
          visit_counted_at?: string | null
          zone?: string
        }
        Update: {
          branch_id?: string
          confirmed_at?: string | null
          customer_id?: string
          distance_m?: number | null
          id?: string
          joined_at?: string
          notes?: string | null
          notified_at?: string | null
          party_size?: number
          position?: number | null
          quoted_wait_min?: number | null
          seated_at?: string | null
          status?: Database["public"]["Enums"]["waitlist_status"]
          table_id?: string | null
          updated_at?: string
          visit_counted_at?: string | null
          zone?: string
        }
        Relationships: [
          {
            foreignKeyName: "waitlist_entries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "waitlist_entries_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "tables"
            referencedColumns: ["id"]
          },
        ]
      }
      winback_settings: {
        Row: {
          days_inactive: number
          is_active: boolean
          restaurant_id: string
          title: string
          updated_at: string
          value: number | null
          value_kind: string
        }
        Insert: {
          days_inactive?: number
          is_active?: boolean
          restaurant_id: string
          title?: string
          updated_at?: string
          value?: number | null
          value_kind?: string
        }
        Update: {
          days_inactive?: number
          is_active?: boolean
          restaurant_id?: string
          title?: string
          updated_at?: string
          value?: number | null
          value_kind?: string
        }
        Relationships: [
          {
            foreignKeyName: "winback_settings_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_waitlist_counts: {
        Args: never
        Returns: {
          branch_id: string
          inside: number
          outside: number
          total: number
        }[]
      }
      service_role_probe: { Args: never; Returns: boolean }
      set_platform_pause: {
        Args: { p_paused: boolean; p_reason?: string }
        Returns: boolean
      }
      set_restaurant_pause: {
        Args: { p_restaurant_id: string; p_paused: boolean; p_reason?: string }
        Returns: boolean
      }
      staff_clear_branch_queue: {
        Args: { p_branch_id: string; p_reason: string }
        Returns: number
      }
      admin_restaurants_list: {
        Args: never
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          owner_phone: string | null
          owner_username: string | null
          slug: string
        }[]
      }
      admin_create_restaurant: {
        Args: {
          p_address?: string
          p_branch_name?: string
          p_city?: string
          p_name: string
          p_name_en?: string
          p_owner_email?: string
          p_slug: string
        }
        Returns: {
          claim_code: string
          slug: string
        }[]
      }
      book_reservation_guest: {
        Args: {
          p_branch_id: string
          p_full_name: string
          p_notes?: string
          p_party_size?: number
          p_phone: string
          p_reserved_at: string
          p_zone?: string
        }
        Returns: {
          reservation_id: string
          reserved_at: string
          table_label: string
        }[]
      }
      branch_busy_hours: {
        Args: { p_branch_id: string }
        Returns: {
          hour_riyadh: number
          joins: number
        }[]
      }
      branch_open_by_hours: {
        Args: { p_hours: Json; p_now?: string }
        Returns: boolean
      }
      caller_branch_id: { Args: { rest_id: string }; Returns: string }
      can_access_branch: { Args: { b_id: string }; Returns: boolean }
      cancel_by_ticket: { Args: { p_entry_id: string }; Returns: boolean }
      cancel_reservation_guest: {
        Args: { p_id: string; p_phone: string }
        Returns: boolean
      }
      cancel_waitlist_guest: {
        Args: { p_entry_id: string; p_phone: string }
        Returns: boolean
      }
      check_rate: {
        Args: { p_key: string; p_max: number; p_window: string }
        Returns: boolean
      }
      claim_restaurant: { Args: { p_code: string }; Returns: string }
      confirm_attendance: { Args: { p_entry_id: string }; Returns: boolean }
      create_restaurant_with_branch: {
        Args: {
          p_address?: string
          p_branch_name: string
          p_city?: string
          p_name: string
          p_name_en?: string
          p_phone?: string
          p_slug: string
          p_timezone?: string
        }
        Returns: string
      }
      customer_segments_with_counts: {
        Args: { p_restaurant_id: string }
        Returns: {
          id: string
          inactive_days: number
          max_visits: number
          member_count: number
          min_visits: number
          name: string
          sort_order: number
        }[]
      }
      delete_dead_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      delete_push_subscription: {
        Args: { p_endpoint: string }
        Returns: undefined
      }
      expire_stale_waitlist: { Args: never; Returns: number }
      gen_claim_code: { Args: never; Returns: string }
      get_customer_rewards: {
        Args: { p_phone: string }
        Returns: {
          code: string
          created_at: string
          description: string
          expires_at: string
          id: string
          kind: string
          redeemed_at: string
          restaurant: string
          restaurant_slug: string
          status: string
          title: string
          value: number
          value_kind: string
        }[]
      }
      grant_reward_to_custom_segment: {
        Args: {
          p_code: string
          p_description: string
          p_expires_at: string
          p_kind: string
          p_segment_id: string
          p_title: string
          p_value: number
          p_value_kind: string
        }
        Returns: number
      }
      grant_reward_to_segment: {
        Args: {
          p_code: string
          p_description: string
          p_expires_at: string
          p_kind: string
          p_restaurant_id: string
          p_segment: string
          p_title: string
          p_value: number
          p_value_kind: string
        }
        Returns: number
      }
      guest_status_by_phone: {
        Args: { p_phone: string; p_ip?: string }
        Returns: {
          at: string
          kind: string
          party_size: number
          position: number | null
          status: string
        }[]
      }
      has_feature: {
        Args: { p_module: string; rest_id: string }
        Returns: boolean
      }
      health_snapshot: { Args: never; Returns: Json }
      is_brand_manager: { Args: { rest_id: string }; Returns: boolean }
      is_manager_of: { Args: { rest_id: string }; Returns: boolean }
      is_platform_admin: { Args: never; Returns: boolean }
      is_staff_of: { Args: { rest_id: string }; Returns: boolean }
      join_waitlist_guest: {
        Args: {
          p_branch_id: string
          p_full_name: string
          p_party_size?: number
          p_phone: string
          p_zone?: string
        }
        Returns: {
          entry_id: string
          queue_pos: number
        }[]
      }
      my_branch_ids: { Args: never; Returns: string[] }
      my_branch_ids_for: { Args: { p_perm: string }; Returns: string[] }
      my_managed_branch_ids: { Args: never; Returns: string[] }
      my_rewards: {
        Args: never
        Returns: {
          armed_at: string
          created_at: string
          description: string
          expires_at: string
          id: string
          kind: string
          redeemed_at: string
          restaurant: string
          restaurant_slug: string
          status: string
          title: string
          value: number
          value_kind: string
        }[]
      }
      norm_phone_input: { Args: { p: string }; Returns: string }
      pick_table_for: {
        Args: {
          p_at: string
          p_branch_id: string
          p_duration: number
          p_party: number
          p_zone: string
        }
        Returns: string
      }
      push_subs_for_entry: {
        Args: { p_entry_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
        }[]
      }
      queue_push_targets: {
        Args: { p_branch_id: string; p_zone: string }
        Returns: {
          auth: string
          endpoint: string
          entry_id: string
          p256dh: string
          rank: number
        }[]
      }
      queue_push_targets_after_cancel: {
        Args: { p_entry_id: string; p_phone: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          rank: number
          slug: string
          venue: string
        }[]
      }
      queue_push_targets_after_ticket_cancel: {
        Args: { p_entry_id: string }
        Returns: {
          auth: string
          endpoint: string
          p256dh: string
          rank: number
          slug: string
          venue: string
        }[]
      }
      queue_version: { Args: { p_branch_id: string }; Returns: string }
      reception_armed_gifts: {
        Args: { p_branch_id: string }
        Returns: {
          customer_id: string
          title: string
        }[]
      }
      redeem_customer_reward: {
        Args: { p_phone: string; p_reward_id: string }
        Returns: boolean
      }
      reservation_slots: {
        Args: {
          p_branch_id: string
          p_day: string
          p_party: number
          p_zone?: string
        }
        Returns: {
          slot_at: string
          table_id: string
        }[]
      }
      restaurant_of_branch: { Args: { b_id: string }; Returns: string }
      retire_dormant_customers: { Args: { p_months?: number }; Returns: number }
      rewards_by_phone: {
        Args: { p_phone: string; p_ip?: string }
        Returns: {
          armed_at: string | null
          created_at: string
          description: string | null
          expires_at: string | null
          id: string
          kind: string
          redeemed_at: string | null
          status: string
          title: string
          value: number | null
          value_kind: string | null
        }[]
      }
      rollup_all_daily_stats: { Args: { p_date: string }; Returns: number }
      rollup_daily_stats: {
        Args: { p_branch_id: string; p_date: string }
        Returns: undefined
      }
      run_auto_winback: { Args: never; Returns: number }
      run_daily_digest: { Args: never; Returns: number }
      run_retention: { Args: never; Returns: undefined }
      run_weekly_digest: { Args: never; Returns: number }
      save_push_subscription: {
        Args: {
          p_auth: string
          p_endpoint: string
          p_entry_id: string
          p_p256dh: string
          p_phone: string
        }
        Returns: boolean
      }
      segment_member_ids: {
        Args: { p_segment_id: string }
        Returns: {
          customer_id: string
        }[]
      }
      set_branch_status: {
        Args: {
          p_branch_id: string
          p_busy_now: boolean
          p_manually_closed: boolean
        }
        Returns: boolean
      }
      set_entry_distance: {
        Args: { p_entry_id: string; p_lat: number; p_lng: number }
        Returns: boolean
      }
      set_reward_armed: {
        Args: { p_arm: boolean; p_reward_id: string }
        Returns: boolean
      }
      set_reward_armed_by_phone: {
        Args: { p_arm: boolean; p_phone: string; p_reward_id: string }
        Returns: boolean
      }
      set_staff_permission: {
        Args: { p_granted: boolean; p_perm: string; p_staff_id: string }
        Returns: undefined
      }
      staff_add_walkin: {
        Args: {
          p_branch_id: string
          p_full_name: string
          p_party_size?: number
          p_phone: string
          p_zone?: string
        }
        Returns: {
          entry_id: string
          queue_pos: number
        }[]
      }
      log_push_sends: { Args: { p_rows: Json }; Returns: number }
      retire_phone_lookup_log: { Args: Record<PropertyKey, never>; Returns: number }
      staff_branch_queue: {
        Args: { p_branch_id: string }
        Returns: {
          confirmed_at: string | null
          customer_id: string
          distance_m: number | null
          full_name: string
          id: string
          joined_at: string
          party_size: number
          phone: string
          position: number | null
          status: Database["public"]["Enums"]["waitlist_status"]
          zone: string
        }[]
      }
      staff_can_read_customer: { Args: { cust_id: string }; Returns: boolean }
      staff_has_perm: {
        Args: { p_perm: string; rest_id: string }
        Returns: boolean
      }
      staff_lookup_rewards: {
        Args: { p_query: string }
        Returns: {
          code: string
          created_at: string
          customer_name: string
          customer_phone: string
          expires_at: string
          id: string
          kind: string
          title: string
          value: number
          value_kind: string
        }[]
      }
      staff_redeem_reward: { Args: { p_reward_id: string }; Returns: boolean }
      submit_review: {
        Args: {
          p_comment?: string
          p_phone: string
          p_rating: number
          p_slug: string
        }
        Returns: Json
      }
      tv_queue: {
        Args: { p_branch_id: string }
        Returns: {
          branch_name: string
          display_name: string
          rank: number
          restaurant_logo: string
          restaurant_name: string
          restaurant_slug: string
          served_today: number
          status: string
          zone: string
        }[]
      }
      valid_branch_zone: {
        Args: { p_branch_id: string; p_zone: string }
        Returns: string
      }
      waitlist_counts: {
        Args: { b_id: string }
        Returns: {
          inside: number
          outside: number
          total: number
        }[]
      }
      waitlist_counts_by_zone: {
        Args: { p_branch_ids: string[] }
        Returns: {
          branch_id: string
          waiting: number
          zone_key: string
        }[]
      }
      waitlist_counts_for: {
        Args: { p_branch_ids: string[] }
        Returns: {
          branch_id: string
          inside: number
          outside: number
          total: number
        }[]
      }
      waitlist_ticket_by_id: {
        Args: { p_entry_id: string }
        Returns: {
          ahead: number
          confirmed: boolean
          position: number
          restaurant: string
          slug: string
          status: string
          total: number
        }[]
      }
      waitlist_ticket_status: {
        Args: { p_entry_id: string; p_phone: string }
        Returns: {
          ahead: number
          position: number
          status: string
          total: number
        }[]
      }
    }
    Enums: {
      notification_channel: "sms" | "whatsapp" | "push" | "email"
      reservation_status:
        | "pending"
        | "confirmed"
        | "seated"
        | "completed"
        | "cancelled"
        | "no_show"
      table_status: "available" | "occupied" | "reserved" | "inactive"
      user_role: "owner" | "manager" | "staff" | "host"
      waitlist_status:
        | "waiting"
        | "notified"
        | "seated"
        | "cancelled"
        | "no_show"
        | "expired"
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
    Enums: {
      notification_channel: ["sms", "whatsapp", "push", "email"],
      reservation_status: [
        "pending",
        "confirmed",
        "seated",
        "completed",
        "cancelled",
        "no_show",
      ],
      table_status: ["available", "occupied", "reserved", "inactive"],
      user_role: ["owner", "manager", "staff", "host"],
      waitlist_status: [
        "waiting",
        "notified",
        "seated",
        "cancelled",
        "no_show",
        "expired",
      ],
    },
  },
} as const
