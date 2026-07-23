export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branch_settings: {
        Row: {
          accepts_reservations: boolean
          accepts_waitlist: boolean
          booking_window_days: number
          branch_id: string
          charge_customer: boolean
          custom: Json | null
          default_duration_min: number
          grace_period_min: number
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
          charge_customer?: boolean
          custom?: Json | null
          default_duration_min?: number
          grace_period_min?: number
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
          charge_customer?: boolean
          custom?: Json | null
          default_duration_min?: number
          grace_period_min?: number
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
          points: number
          restaurant_id: string
          tags: string[]
          tier: string
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
          points?: number
          restaurant_id: string
          tags?: string[]
          tier?: string
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
          points?: number
          restaurant_id?: string
          tags?: string[]
          tier?: string
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
        Relationships: []
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
      loyalty_programs: {
        Row: {
          is_active: boolean
          points_per_visit: number
          restaurant_id: string
          reward_description: string | null
          reward_threshold: number
          updated_at: string
        }
        Insert: {
          is_active?: boolean
          points_per_visit?: number
          restaurant_id: string
          reward_description?: string | null
          reward_threshold?: number
          updated_at?: string
        }
        Update: {
          is_active?: boolean
          points_per_visit?: number
          restaurant_id?: string
          reward_description?: string | null
          reward_threshold?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "loyalty_programs_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: true
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      menu_categories: {
        Row: {
          created_at: string
          id: string
          name: string
          restaurant_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          restaurant_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          restaurant_id?: string
          sort_order?: number
        }
        Relationships: [
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
          category_id: string
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_available: boolean
          name: string
          price: number | null
          restaurant_id: string
          sort_order: number
          updated_at: string
        }
        Insert: {
          category_id: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name: string
          price?: number | null
          restaurant_id: string
          sort_order?: number
          updated_at?: string
        }
        Update: {
          category_id?: string
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_available?: boolean
          name?: string
          price?: number | null
          restaurant_id?: string
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
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
      offer_redemptions: {
        Row: {
          amount: number | null
          branch_id: string | null
          customer_id: string | null
          id: string
          offer_id: string
          redeemed_at: string
          restaurant_id: string
        }
        Insert: {
          amount?: number | null
          branch_id?: string | null
          customer_id?: string | null
          id?: string
          offer_id: string
          redeemed_at?: string
          restaurant_id: string
        }
        Update: {
          amount?: number | null
          branch_id?: string | null
          customer_id?: string | null
          id?: string
          offer_id?: string
          redeemed_at?: string
          restaurant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "offer_redemptions_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_offer_id_fkey"
            columns: ["offer_id"]
            isOneToOne: false
            referencedRelation: "offers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offer_redemptions_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
            referencedColumns: ["id"]
          },
        ]
      }
      offers: {
        Row: {
          audience: string
          code: string | null
          conditions: Json
          created_at: string
          description: string | null
          ends_at: string | null
          id: string
          is_active: boolean
          kind: Database["public"]["Enums"]["offer_kind"]
          per_customer_limit: number
          redeemed_count: number
          restaurant_id: string
          starts_at: string | null
          title: string
          total_limit: number | null
          updated_at: string
          value: number | null
        }
        Insert: {
          audience?: string
          code?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind: Database["public"]["Enums"]["offer_kind"]
          per_customer_limit?: number
          redeemed_count?: number
          restaurant_id: string
          starts_at?: string | null
          title: string
          total_limit?: number | null
          updated_at?: string
          value?: number | null
        }
        Update: {
          audience?: string
          code?: string | null
          conditions?: Json
          created_at?: string
          description?: string | null
          ends_at?: string | null
          id?: string
          is_active?: boolean
          kind?: Database["public"]["Enums"]["offer_kind"]
          per_customer_limit?: number
          redeemed_count?: number
          restaurant_id?: string
          starts_at?: string | null
          title?: string
          total_limit?: number | null
          updated_at?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "offers_restaurant_id_fkey"
            columns: ["restaurant_id"]
            isOneToOne: false
            referencedRelation: "restaurants"
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
          caption: string | null
          created_at: string
          id: string
          restaurant_id: string
          sort_order: number
          url: string
        }
        Insert: {
          caption?: string | null
          created_at?: string
          id?: string
          restaurant_id: string
          sort_order?: number
          url: string
        }
        Update: {
          caption?: string | null
          created_at?: string
          id?: string
          restaurant_id?: string
          sort_order?: number
          url?: string
        }
        Relationships: [
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
          description: string | null
          email: string | null
          id: string
          is_active: boolean
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
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
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
          description?: string | null
          email?: string | null
          id?: string
          is_active?: boolean
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
          customer_id: string
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
          zone: string
        }
        Insert: {
          branch_id: string
          customer_id: string
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
          zone?: string
        }
        Update: {
          branch_id?: string
          customer_id?: string
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
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      active_waitlist_counts: {
        Args: never
        Returns: {
          branch_id: string
          total: number
          inside: number
          outside: number
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
      cancel_waitlist_guest: {
        Args: { p_entry_id: string; p_phone: string }
        Returns: boolean
      }
      claim_restaurant: { Args: { p_code: string }; Returns: string }
      create_reservation_guest: {
        Args: {
          p_branch_id: string
          p_full_name: string
          p_phone: string
          p_reserved_at: string
          p_party_size: number
          p_notes?: string
        }
        Returns: string
      }
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
      redeem_customer_reward: {
        Args: { p_reward_id: string; p_phone: string }
        Returns: boolean
      }
      has_feature: {
        Args: { p_module: string; rest_id: string }
        Returns: boolean
      }
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
      restaurant_of_branch: { Args: { b_id: string }; Returns: string }
      set_staff_permission: {
        Args: { p_staff_id: string; p_perm: string; p_granted: boolean }
        Returns: undefined
      }
      rollup_all_daily_stats: { Args: { p_date: string }; Returns: number }
      rollup_daily_stats: {
        Args: { p_branch_id: string; p_date: string }
        Returns: undefined
      }
      staff_can_read_customer: { Args: { cust_id: string }; Returns: boolean }
      staff_has_perm: {
        Args: { p_perm: string; rest_id: string }
        Returns: boolean
      }
      waitlist_counts: {
        Args: { b_id: string }
        Returns: {
          inside: number
          outside: number
          total: number
        }[]
      }
    }
    Enums: {
      notification_channel: "sms" | "whatsapp" | "push" | "email"
      offer_kind: "percent" | "fixed" | "free_item" | "bogo" | "points"
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
      offer_kind: ["percent", "fixed", "free_item", "bogo", "points"],
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
