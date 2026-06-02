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
      biometrias: {
        Row: {
          amostras: number | null
          created_at: string
          data_biometria: string
          id: string
          observacao: string | null
          peso_medio_g: number
          sobrevivencia_percent: number | null
          updated_at: string
          user_id: string
          viveiro_id: string
        }
        Insert: {
          amostras?: number | null
          created_at?: string
          data_biometria?: string
          id?: string
          observacao?: string | null
          peso_medio_g: number
          sobrevivencia_percent?: number | null
          updated_at?: string
          user_id: string
          viveiro_id: string
        }
        Update: {
          amostras?: number | null
          created_at?: string
          data_biometria?: string
          id?: string
          observacao?: string | null
          peso_medio_g?: number
          sobrevivencia_percent?: number | null
          updated_at?: string
          user_id?: string
          viveiro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "biometrias_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
      }
      categorias: {
        Row: {
          created_at: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      fazendas: {
        Row: {
          cidade: string | null
          created_at: string
          id: string
          nome: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cidade?: string | null
          created_at?: string
          id?: string
          nome?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      lancamentos: {
        Row: {
          created_at: string
          custo_total: number | null
          data_lancamento: string
          id: string
          observacao: string | null
          preco_unidade: number | null
          produto_id: string | null
          produto_nome: string
          quantidade: number
          tipo: string
          unidade: string
          updated_at: string
          user_id: string
          vezes: number | null
          viveiro_id: string
        }
        Insert: {
          created_at?: string
          custo_total?: number | null
          data_lancamento?: string
          id?: string
          observacao?: string | null
          preco_unidade?: number | null
          produto_id?: string | null
          produto_nome: string
          quantidade: number
          tipo?: string
          unidade?: string
          updated_at?: string
          user_id: string
          vezes?: number | null
          viveiro_id: string
        }
        Update: {
          created_at?: string
          custo_total?: number | null
          data_lancamento?: string
          id?: string
          observacao?: string | null
          preco_unidade?: number | null
          produto_id?: string | null
          produto_nome?: string
          quantidade?: number
          tipo?: string
          unidade?: string
          updated_at?: string
          user_id?: string
          vezes?: number | null
          viveiro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lancamentos_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lancamentos_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
      }
      produtos: {
        Row: {
          categoria: string
          created_at: string
          id: string
          nome: string
          preco_unidade: number | null
          unidade: string
          updated_at: string
          user_id: string
        }
        Insert: {
          categoria?: string
          created_at?: string
          id?: string
          nome: string
          preco_unidade?: number | null
          unidade?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          categoria?: string
          created_at?: string
          id?: string
          nome?: string
          preco_unidade?: number | null
          unidade?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          id: string
          nome: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id: string
          nome?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      viveiros: {
        Row: {
          created_at: string
          data_povoamento: string | null
          fazenda_id: string
          fornecedor: string | null
          id: string
          nome: string
          qtd_povoada: number | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          data_povoamento?: string | null
          fazenda_id: string
          fornecedor?: string | null
          id?: string
          nome: string
          qtd_povoada?: number | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          data_povoamento?: string | null
          fazenda_id?: string
          fornecedor?: string | null
          id?: string
          nome?: string
          qtd_povoada?: number | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "viveiros_fazenda_id_fkey"
            columns: ["fazenda_id"]
            isOneToOne: false
            referencedRelation: "fazendas"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
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
