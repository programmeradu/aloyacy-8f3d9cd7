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
      active_trips: {
        Row: {
          alerts_sent: string[]
          alight_name: string | null
          alight_stop_id: string | null
          alight_unix: number | null
          board_name: string | null
          board_stop_id: string | null
          board_unix: number | null
          device_id: string
          itinerary_id: string | null
          legs: Json | null
          route_short: string | null
          started_at: string
          total_arrival_unix: number | null
          trip_id: string
          updated_at: string
          walk_in_sec: number
          walk_out_sec: number
        }
        Insert: {
          alerts_sent?: string[]
          alight_name?: string | null
          alight_stop_id?: string | null
          alight_unix?: number | null
          board_name?: string | null
          board_stop_id?: string | null
          board_unix?: number | null
          device_id: string
          itinerary_id?: string | null
          legs?: Json | null
          route_short?: string | null
          started_at?: string
          total_arrival_unix?: number | null
          trip_id: string
          updated_at?: string
          walk_in_sec?: number
          walk_out_sec?: number
        }
        Update: {
          alerts_sent?: string[]
          alight_name?: string | null
          alight_stop_id?: string | null
          alight_unix?: number | null
          board_name?: string | null
          board_stop_id?: string | null
          board_unix?: number | null
          device_id?: string
          itinerary_id?: string | null
          legs?: Json | null
          route_short?: string | null
          started_at?: string
          total_arrival_unix?: number | null
          trip_id?: string
          updated_at?: string
          walk_in_sec?: number
          walk_out_sec?: number
        }
        Relationships: []
      }
      alert_counters: {
        Row: {
          count: number
          kind: string
          last_fired_at: string
        }
        Insert: {
          count?: number
          kind: string
          last_fired_at?: string
        }
        Update: {
          count?: number
          kind?: string
          last_fired_at?: string
        }
        Relationships: []
      }
      bus_sightings: {
        Row: {
          device_id: string
          id: number
          lat: number
          lng: number
          reported_at: string
          route_id: string | null
          stop_id: string | null
          trip_id: string
        }
        Insert: {
          device_id: string
          id?: number
          lat: number
          lng: number
          reported_at?: string
          route_id?: string | null
          stop_id?: string | null
          trip_id: string
        }
        Update: {
          device_id?: string
          id?: number
          lat?: number
          lng?: number
          reported_at?: string
          route_id?: string | null
          stop_id?: string | null
          trip_id?: string
        }
        Relationships: []
      }
      commute_patterns: {
        Row: {
          count: number
          dow_mask: number
          from_h3: string
          from_label: string | null
          from_lat: number | null
          from_lng: number | null
          id: number
          last_seen: string
          time_bucket: number
          to_h3: string
          to_label: string | null
          to_lat: number | null
          to_lng: number | null
          user_id: string
        }
        Insert: {
          count?: number
          dow_mask?: number
          from_h3: string
          from_label?: string | null
          from_lat?: number | null
          from_lng?: number | null
          id?: number
          last_seen?: string
          time_bucket: number
          to_h3: string
          to_label?: string | null
          to_lat?: number | null
          to_lng?: number | null
          user_id: string
        }
        Update: {
          count?: number
          dow_mask?: number
          from_h3?: string
          from_label?: string | null
          from_lat?: number | null
          from_lng?: number | null
          id?: number
          last_seen?: string
          time_bucket?: number
          to_h3?: string
          to_label?: string | null
          to_lat?: number | null
          to_lng?: number | null
          user_id?: string
        }
        Relationships: []
      }
      delay_stats: {
        Row: {
          day_of_week: number
          hour_of_day: number
          mean_delay_sec: number
          route_id: string
          sample_count: number
          stddev_delay_sec: number
          stop_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          hour_of_day: number
          mean_delay_sec?: number
          route_id: string
          sample_count?: number
          stddev_delay_sec?: number
          stop_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          hour_of_day?: number
          mean_delay_sec?: number
          route_id?: string
          sample_count?: number
          stddev_delay_sec?: number
          stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      device_auth: {
        Row: {
          created_at: string
          device_id: string
          token_hash: string
        }
        Insert: {
          created_at?: string
          device_id: string
          token_hash: string
        }
        Update: {
          created_at?: string
          device_id?: string
          token_hash?: string
        }
        Relationships: []
      }
      dwell_observations: {
        Row: {
          day_of_week: number
          hour_of_day: number
          id: number
          mean_dwell_sec: number
          route_id: string
          sample_count: number
          stop_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          hour_of_day: number
          id?: number
          mean_dwell_sec?: number
          route_id: string
          sample_count?: number
          stop_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          hour_of_day?: number
          id?: number
          mean_dwell_sec?: number
          route_id?: string
          sample_count?: number
          stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      dwell_stats: {
        Row: {
          day_of_week: number
          hour_of_day: number
          id: number
          mean_dwell_sec: number
          route_id: string
          sample_count: number
          stop_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          hour_of_day: number
          id?: number
          mean_dwell_sec?: number
          route_id: string
          sample_count?: number
          stop_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          hour_of_day?: number
          id?: number
          mean_dwell_sec?: number
          route_id?: string
          sample_count?: number
          stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      expo_push_tokens: {
        Row: {
          app_version: string | null
          created_at: string
          device_id: string
          expo_token: string
          id: string
          last_seen_at: string
          platform: string
        }
        Insert: {
          app_version?: string | null
          created_at?: string
          device_id: string
          expo_token: string
          id?: string
          last_seen_at?: string
          platform: string
        }
        Update: {
          app_version?: string | null
          created_at?: string
          device_id?: string
          expo_token?: string
          id?: string
          last_seen_at?: string
          platform?: string
        }
        Relationships: []
      }
      feed_truth_delta: {
        Row: {
          day_of_week: number
          hour_of_day: number
          id: number
          mean_delta_m: number
          mean_delta_sec: number
          route_id: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          day_of_week: number
          hour_of_day: number
          id?: number
          mean_delta_m?: number
          mean_delta_sec?: number
          route_id: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          hour_of_day?: number
          id?: number
          mean_delta_m?: number
          mean_delta_sec?: number
          route_id?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      headway_observations: {
        Row: {
          bunching_count: number
          day_of_week: number
          hour_of_day: number
          id: number
          observed_headway_sec: number
          route_id: string
          sample_count: number
          scheduled_headway_sec: number
          stop_id: string
          updated_at: string
        }
        Insert: {
          bunching_count?: number
          day_of_week: number
          hour_of_day: number
          id?: number
          observed_headway_sec?: number
          route_id: string
          sample_count?: number
          scheduled_headway_sec?: number
          stop_id: string
          updated_at?: string
        }
        Update: {
          bunching_count?: number
          day_of_week?: number
          hour_of_day?: number
          id?: number
          observed_headway_sec?: number
          route_id?: string
          sample_count?: number
          scheduled_headway_sec?: number
          stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      model_versions: {
        Row: {
          created_at: string
          id: number
          is_active: boolean
          name: string
          params: Json
        }
        Insert: {
          created_at?: string
          id?: number
          is_active?: boolean
          name: string
          params?: Json
        }
        Update: {
          created_at?: string
          id?: number
          is_active?: boolean
          name?: string
          params?: Json
        }
        Relationships: []
      }
      motion_card: {
        Row: {
          balance_eur: number
          balance_updated_at: string | null
          card_number: string
          card_type: string | null
          created_at: string
          holder: string | null
          jcc_display_name: string | null
          jcc_email: string | null
          jcc_linked_at: string | null
          jcc_tokens_encrypted: string | null
          last_sync_at: string | null
          pass_name: string | null
          tier: string | null
          updated_at: string
          user_id: string
          valid_until: string | null
        }
        Insert: {
          balance_eur?: number
          balance_updated_at?: string | null
          card_number: string
          card_type?: string | null
          created_at?: string
          holder?: string | null
          jcc_display_name?: string | null
          jcc_email?: string | null
          jcc_linked_at?: string | null
          jcc_tokens_encrypted?: string | null
          last_sync_at?: string | null
          pass_name?: string | null
          tier?: string | null
          updated_at?: string
          user_id: string
          valid_until?: string | null
        }
        Update: {
          balance_eur?: number
          balance_updated_at?: string | null
          card_number?: string
          card_type?: string | null
          created_at?: string
          holder?: string | null
          jcc_display_name?: string | null
          jcc_email?: string | null
          jcc_linked_at?: string | null
          jcc_tokens_encrypted?: string | null
          last_sync_at?: string | null
          pass_name?: string | null
          tier?: string | null
          updated_at?: string
          user_id?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      observed_arrivals: {
        Row: {
          last_delay_sec: number
          last_predicted_arrival: string
          last_seen_at: string
          passed_at: string | null
          route_id: string
          stop_id: string
          trip_id: string
        }
        Insert: {
          last_delay_sec?: number
          last_predicted_arrival: string
          last_seen_at?: string
          passed_at?: string | null
          route_id: string
          stop_id: string
          trip_id: string
        }
        Update: {
          last_delay_sec?: number
          last_predicted_arrival?: string
          last_seen_at?: string
          passed_at?: string | null
          route_id?: string
          stop_id?: string
          trip_id?: string
        }
        Relationships: []
      }
      pulse_signals: {
        Row: {
          fetched_at: string
          id: number
          key: string
          payload: Json
          scope: string
          source: string
          ttl_seconds: number
        }
        Insert: {
          fetched_at?: string
          id?: number
          key: string
          payload: Json
          scope?: string
          source: string
          ttl_seconds?: number
        }
        Update: {
          fetched_at?: string
          id?: number
          key?: string
          payload?: Json
          scope?: string
          source?: string
          ttl_seconds?: number
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          device_id: string
          endpoint: string
          id: string
          last_seen_at: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          device_id: string
          endpoint: string
          id?: string
          last_seen_at?: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          device_id?: string
          endpoint?: string
          id?: string
          last_seen_at?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      rider_vehicle_fixes: {
        Row: {
          accuracy_m: number | null
          bearing: number | null
          device_id: string
          id: number
          lat: number
          lng: number
          reported_at: string
          route_id: string | null
          speed_mps: number | null
          trip_id: string
        }
        Insert: {
          accuracy_m?: number | null
          bearing?: number | null
          device_id: string
          id?: number
          lat: number
          lng: number
          reported_at?: string
          route_id?: string | null
          speed_mps?: number | null
          trip_id: string
        }
        Update: {
          accuracy_m?: number | null
          bearing?: number | null
          device_id?: string
          id?: number
          lat?: number
          lng?: number
          reported_at?: string
          route_id?: string | null
          speed_mps?: number | null
          trip_id?: string
        }
        Relationships: []
      }
      route_crowding: {
        Row: {
          device_count: number
          id: number
          route_id: string
          trip_id: string
          window_start: string
        }
        Insert: {
          device_count?: number
          id?: number
          route_id: string
          trip_id: string
          window_start: string
        }
        Update: {
          device_count?: number
          id?: number
          route_id?: string
          trip_id?: string
          window_start?: string
        }
        Relationships: []
      }
      route_load_estimates: {
        Row: {
          id: number
          load_index: number
          rider_count: number
          route_id: string
          trip_id: string
          updated_at: string
          window_start: string
        }
        Insert: {
          id?: number
          load_index?: number
          rider_count?: number
          route_id: string
          trip_id: string
          updated_at?: string
          window_start: string
        }
        Update: {
          id?: number
          load_index?: number
          rider_count?: number
          route_id?: string
          trip_id?: string
          updated_at?: string
          window_start?: string
        }
        Relationships: []
      }
      rt_snapshots: {
        Row: {
          captured_at: string
          delay_sec: number
          id: number
          predicted_arrival: string
          route_id: string
          stop_id: string
          trip_id: string
        }
        Insert: {
          captured_at?: string
          delay_sec?: number
          id?: number
          predicted_arrival: string
          route_id: string
          stop_id: string
          trip_id: string
        }
        Update: {
          captured_at?: string
          delay_sec?: number
          id?: number
          predicted_arrival?: string
          route_id?: string
          stop_id?: string
          trip_id?: string
        }
        Relationships: []
      }
      saved_places: {
        Row: {
          address: string | null
          created_at: string
          id: string
          kind: string
          label: string
          lat: number
          lng: number
          updated_at: string
          user_id: string
        }
        Insert: {
          address?: string | null
          created_at?: string
          id?: string
          kind: string
          label: string
          lat: number
          lng: number
          updated_at?: string
          user_id: string
        }
        Update: {
          address?: string | null
          created_at?: string
          id?: string
          kind?: string
          label?: string
          lat?: number
          lng?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      scheduled_departures: {
        Row: {
          arrive_by_unix: number
          created_at: string
          id: string
          last_check_at: string | null
          notified_at: string | null
          plan_json: Json
          push_subscription_id: string | null
          remind_at_unix: number
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          arrive_by_unix: number
          created_at?: string
          id?: string
          last_check_at?: string | null
          notified_at?: string | null
          plan_json: Json
          push_subscription_id?: string | null
          remind_at_unix: number
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          arrive_by_unix?: number
          created_at?: string
          id?: string
          last_check_at?: string | null
          notified_at?: string | null
          plan_json?: Json
          push_subscription_id?: string | null
          remind_at_unix?: number
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      segment_runtimes: {
        Row: {
          day_of_week: number
          from_stop_id: string
          hour_of_day: number
          id: number
          mean_runtime_sec: number
          route_id: string
          sample_count: number
          stddev_runtime_sec: number
          to_stop_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          from_stop_id: string
          hour_of_day: number
          id?: number
          mean_runtime_sec?: number
          route_id: string
          sample_count?: number
          stddev_runtime_sec?: number
          to_stop_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          from_stop_id?: string
          hour_of_day?: number
          id?: number
          mean_runtime_sec?: number
          route_id?: string
          sample_count?: number
          stddev_runtime_sec?: number
          to_stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      segment_speeds: {
        Row: {
          day_of_week: number
          from_stop_id: string
          hour_of_day: number
          id: number
          mean_mps: number
          route_id: string
          sample_count: number
          to_stop_id: string
          updated_at: string
        }
        Insert: {
          day_of_week: number
          from_stop_id: string
          hour_of_day: number
          id?: number
          mean_mps?: number
          route_id: string
          sample_count?: number
          to_stop_id: string
          updated_at?: string
        }
        Update: {
          day_of_week?: number
          from_stop_id?: string
          hour_of_day?: number
          id?: number
          mean_mps?: number
          route_id?: string
          sample_count?: number
          to_stop_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      shared_trips: {
        Row: {
          created_at: string
          destination_label: string
          destination_lat: number
          destination_lng: number
          eta_minutes: number | null
          expires_at: string
          id: string
          last_lat: number | null
          last_lng: number | null
          last_updated: string | null
          origin_label: string | null
          owner_id: string | null
          status: string
          token: string
        }
        Insert: {
          created_at?: string
          destination_label: string
          destination_lat: number
          destination_lng: number
          eta_minutes?: number | null
          expires_at?: string
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_updated?: string | null
          origin_label?: string | null
          owner_id?: string | null
          status?: string
          token: string
        }
        Update: {
          created_at?: string
          destination_label?: string
          destination_lat?: number
          destination_lng?: number
          eta_minutes?: number | null
          expires_at?: string
          id?: string
          last_lat?: number | null
          last_lng?: number | null
          last_updated?: string | null
          origin_label?: string | null
          owner_id?: string | null
          status?: string
          token?: string
        }
        Relationships: []
      }
      subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          environment: string
          id: string
          plan_key: string | null
          price_id: string | null
          product_id: string | null
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          plan_key?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          environment?: string
          id?: string
          plan_key?: string | null
          price_id?: string | null
          product_id?: string | null
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      training_events: {
        Row: {
          device_id: string
          id: number
          kind: string
          payload: Json
          processed_at: string | null
          recorded_at: string
        }
        Insert: {
          device_id: string
          id?: number
          kind: string
          payload?: Json
          processed_at?: string | null
          recorded_at?: string
        }
        Update: {
          device_id?: string
          id?: number
          kind?: string
          payload?: Json
          processed_at?: string | null
          recorded_at?: string
        }
        Relationships: []
      }
      training_runs: {
        Row: {
          finished_at: string | null
          id: number
          ok: boolean
          started_at: string
          stats: Json
        }
        Insert: {
          finished_at?: string | null
          id?: number
          ok?: boolean
          started_at?: string
          stats?: Json
        }
        Update: {
          finished_at?: string | null
          id?: number
          ok?: boolean
          started_at?: string
          stats?: Json
        }
        Relationships: []
      }
      transfer_outcomes: {
        Row: {
          at_stop_id: string
          attempts: number
          day_of_week: number
          from_route: string
          hour_of_day: number
          id: number
          planned_wait_sec: number
          successes: number
          to_route: string
          updated_at: string
        }
        Insert: {
          at_stop_id: string
          attempts?: number
          day_of_week: number
          from_route: string
          hour_of_day: number
          id?: number
          planned_wait_sec?: number
          successes?: number
          to_route: string
          updated_at?: string
        }
        Update: {
          at_stop_id?: string
          attempts?: number
          day_of_week?: number
          from_route?: string
          hour_of_day?: number
          id?: number
          planned_wait_sec?: number
          successes?: number
          to_route?: string
          updated_at?: string
        }
        Relationships: []
      }
      trip_group_members: {
        Row: {
          display_name: string
          eta_minutes: number | null
          group_id: string
          id: string
          is_creator: boolean
          joined_at: string
          last_lat: number | null
          last_lng: number | null
          last_updated: string | null
          member_token: string
          origin_label: string | null
          owner_id: string | null
          status: string
        }
        Insert: {
          display_name: string
          eta_minutes?: number | null
          group_id: string
          id?: string
          is_creator?: boolean
          joined_at?: string
          last_lat?: number | null
          last_lng?: number | null
          last_updated?: string | null
          member_token: string
          origin_label?: string | null
          owner_id?: string | null
          status?: string
        }
        Update: {
          display_name?: string
          eta_minutes?: number | null
          group_id?: string
          id?: string
          is_creator?: boolean
          joined_at?: string
          last_lat?: number | null
          last_lng?: number | null
          last_updated?: string | null
          member_token?: string
          origin_label?: string | null
          owner_id?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "trip_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "trip_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      trip_groups: {
        Row: {
          code: string
          created_at: string
          created_by_id: string | null
          created_by_name: string | null
          destination_label: string
          destination_lat: number
          destination_lng: number
          expires_at: string
          id: string
        }
        Insert: {
          code: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          destination_label: string
          destination_lat: number
          destination_lng: number
          expires_at?: string
          id?: string
        }
        Update: {
          code?: string
          created_at?: string
          created_by_id?: string | null
          created_by_name?: string | null
          destination_label?: string
          destination_lat?: number
          destination_lng?: number
          expires_at?: string
          id?: string
        }
        Relationships: []
      }
      trip_history: {
        Row: {
          device_id: string
          dow: number
          from_label: string
          from_lat: number
          from_lng: number
          hour: number
          id: string
          recorded_at: string
          route_short: string | null
          source: string
          to_label: string
          to_lat: number
          to_lng: number
          user_id: string | null
        }
        Insert: {
          device_id: string
          dow: number
          from_label: string
          from_lat: number
          from_lng: number
          hour: number
          id?: string
          recorded_at?: string
          route_short?: string | null
          source?: string
          to_label: string
          to_lat: number
          to_lng: number
          user_id?: string | null
        }
        Update: {
          device_id?: string
          dow?: number
          from_label?: string
          from_lat?: number
          from_lng?: number
          hour?: number
          id?: string
          recorded_at?: string
          route_short?: string | null
          source?: string
          to_label?: string
          to_lat?: number
          to_lng?: number
          user_id?: string | null
        }
        Relationships: []
      }
      trip_history_cloud: {
        Row: {
          created_at: string
          duration_sec: number | null
          from_label: string
          from_lat: number
          from_lng: number
          id: string
          route_id: string | null
          taken_at: string
          to_label: string
          to_lat: number
          to_lng: number
          user_id: string
        }
        Insert: {
          created_at?: string
          duration_sec?: number | null
          from_label: string
          from_lat: number
          from_lng: number
          id?: string
          route_id?: string | null
          taken_at: string
          to_label: string
          to_lat: number
          to_lng: number
          user_id: string
        }
        Update: {
          created_at?: string
          duration_sec?: number | null
          from_label?: string
          from_lat?: number
          from_lng?: number
          id?: string
          route_id?: string | null
          taken_at?: string
          to_label?: string
          to_lat?: number
          to_lng?: number
          user_id?: string
        }
        Relationships: []
      }
      trip_no_shows: {
        Row: {
          detected_at: string
          id: number
          route_id: string
          service_date: string
          trip_id: string
        }
        Insert: {
          detected_at?: string
          id?: number
          route_id: string
          service_date: string
          trip_id: string
        }
        Update: {
          detected_at?: string
          id?: number
          route_id?: string
          service_date?: string
          trip_id?: string
        }
        Relationships: []
      }
      trip_overrides: {
        Row: {
          actual_legs: Json | null
          device_id: string
          dow: number
          from_lat: number
          from_lng: number
          hour: number
          id: string
          kind: string
          planned_legs: Json
          recorded_at: string
          to_lat: number
          to_lng: number
        }
        Insert: {
          actual_legs?: Json | null
          device_id: string
          dow: number
          from_lat: number
          from_lng: number
          hour: number
          id?: string
          kind: string
          planned_legs: Json
          recorded_at?: string
          to_lat: number
          to_lng: number
        }
        Update: {
          actual_legs?: Json | null
          device_id?: string
          dow?: number
          from_lat?: number
          from_lng?: number
          hour?: number
          id?: string
          kind?: string
          planned_legs?: Json
          recorded_at?: string
          to_lat?: number
          to_lng?: number
        }
        Relationships: []
      }
      user_settings: {
        Row: {
          accessibility_prefs: Json
          consent_analytics: boolean
          consent_cookies_at: string | null
          created_at: string
          locale: string
          notif_disruptions: boolean
          notif_trip_alerts: boolean
          onboarded_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          accessibility_prefs?: Json
          consent_analytics?: boolean
          consent_cookies_at?: string | null
          created_at?: string
          locale?: string
          notif_disruptions?: boolean
          notif_trip_alerts?: boolean
          onboarded_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          accessibility_prefs?: Json
          consent_analytics?: boolean
          consent_cookies_at?: string | null
          created_at?: string
          locale?: string
          notif_disruptions?: boolean
          notif_trip_alerts?: boolean
          onboarded_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      walk_links: {
        Row: {
          computed_at: string
          distance_m: number
          duration_sec: number
          from_stop_id: string
          id: string
          polyline: string
          to_stop_id: string
        }
        Insert: {
          computed_at?: string
          distance_m: number
          duration_sec: number
          from_stop_id: string
          id?: string
          polyline: string
          to_stop_id: string
        }
        Update: {
          computed_at?: string
          distance_m?: number
          duration_sec?: number
          from_stop_id?: string
          id?: string
          polyline?: string
          to_stop_id?: string
        }
        Relationships: []
      }
      walk_pace_stats: {
        Row: {
          device_id: string
          mean_mps: number
          sample_count: number
          updated_at: string
        }
        Insert: {
          device_id: string
          mean_mps?: number
          sample_count?: number
          updated_at?: string
        }
        Update: {
          device_id?: string
          mean_mps?: number
          sample_count?: number
          updated_at?: string
        }
        Relationships: []
      }
      weather_delay_coupling: {
        Row: {
          condition: string
          hour_of_day: number
          id: number
          mean_extra_delay_sec: number
          route_id: string
          sample_count: number
          updated_at: string
        }
        Insert: {
          condition: string
          hour_of_day: number
          id?: number
          mean_extra_delay_sec?: number
          route_id: string
          sample_count?: number
          updated_at?: string
        }
        Update: {
          condition?: string
          hour_of_day?: number
          id?: number
          mean_extra_delay_sec?: number
          route_id?: string
          sample_count?: number
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      bump_alert_counter: { Args: { p_kind: string }; Returns: undefined }
      cleanup_bus_sightings: { Args: never; Returns: undefined }
      cleanup_pulse_signals: { Args: never; Returns: undefined }
      cleanup_rider_fixes: { Args: never; Returns: undefined }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      email_queue_dispatch: { Args: never; Returns: undefined }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      pulse_route_stats: {
        Args: never
        Returns: {
          route_id: string
          sample_count: number
          sum_delay_weighted: number
        }[]
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
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
