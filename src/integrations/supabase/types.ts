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
          crescimento_semanal_g: number | null
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
          crescimento_semanal_g?: number | null
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
          crescimento_semanal_g?: number | null
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
      caixa_lancamentos: {
        Row: {
          categoria: string
          created_at: string
          data_lancamento: string
          descricao: string
          despesa_id: string | null
          id: string
          lancamento_id: string | null
          observacao: string | null
          quantidade: number | null
          socio_id: string | null
          tipo: string
          unidade: string | null
          updated_at: string
          user_id: string
          valor: number
          viveiro_id: string | null
        }
        Insert: {
          categoria?: string
          created_at?: string
          data_lancamento?: string
          descricao: string
          despesa_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          quantidade?: number | null
          socio_id?: string | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
          user_id: string
          valor: number
          viveiro_id?: string | null
        }
        Update: {
          categoria?: string
          created_at?: string
          data_lancamento?: string
          descricao?: string
          despesa_id?: string | null
          id?: string
          lancamento_id?: string | null
          observacao?: string | null
          quantidade?: number | null
          socio_id?: string | null
          tipo?: string
          unidade?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          viveiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "caixa_lancamentos_despesa_id_fkey"
            columns: ["despesa_id"]
            isOneToOne: false
            referencedRelation: "despesas_gerais"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_lancamento_id_fkey"
            columns: ["lancamento_id"]
            isOneToOne: true
            referencedRelation: "lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "caixa_lancamentos_viveiro_id_fkey"
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
      contas_pagar: {
        Row: {
          caixa_lancamento_id: string | null
          categoria: string | null
          created_at: string
          data_pagamento: string | null
          data_vencimento: string
          descricao: string
          id: string
          observacao: string | null
          pago: boolean
          parent_id: string | null
          recorrencia: string
          socio_id: string | null
          updated_at: string
          user_id: string
          valor: number
          viveiro_id: string | null
        }
        Insert: {
          caixa_lancamento_id?: string | null
          categoria?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao: string
          id?: string
          observacao?: string | null
          pago?: boolean
          parent_id?: string | null
          recorrencia?: string
          socio_id?: string | null
          updated_at?: string
          user_id: string
          valor?: number
          viveiro_id?: string | null
        }
        Update: {
          caixa_lancamento_id?: string | null
          categoria?: string | null
          created_at?: string
          data_pagamento?: string | null
          data_vencimento?: string
          descricao?: string
          id?: string
          observacao?: string | null
          pago?: boolean
          parent_id?: string | null
          recorrencia?: string
          socio_id?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
          viveiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contas_pagar_caixa_lancamento_id_fkey"
            columns: ["caixa_lancamento_id"]
            isOneToOne: false
            referencedRelation: "caixa_lancamentos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "contas_pagar"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_socio_id_fkey"
            columns: ["socio_id"]
            isOneToOne: false
            referencedRelation: "socios"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contas_pagar_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
      }
      despesas_gerais: {
        Row: {
          categoria: string | null
          created_at: string
          data_despesa: string
          descricao: string
          id: string
          observacao: string | null
          rateio: string
          updated_at: string
          user_id: string
          valor: number
          viveiro_id: string | null
        }
        Insert: {
          categoria?: string | null
          created_at?: string
          data_despesa?: string
          descricao: string
          id?: string
          observacao?: string | null
          rateio?: string
          updated_at?: string
          user_id: string
          valor?: number
          viveiro_id?: string | null
        }
        Update: {
          categoria?: string | null
          created_at?: string
          data_despesa?: string
          descricao?: string
          id?: string
          observacao?: string | null
          rateio?: string
          updated_at?: string
          user_id?: string
          valor?: number
          viveiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despesas_gerais_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
      }
      despescas: {
        Row: {
          caixa_lancamento_id: string | null
          created_at: string
          data_despesca: string
          id: string
          observacao: string | null
          preco_kg: number
          quantidade_kg: number
          status: string
          updated_at: string
          user_id: string
          valor_total: number
          viveiro_id: string | null
        }
        Insert: {
          caixa_lancamento_id?: string | null
          created_at?: string
          data_despesca?: string
          id?: string
          observacao?: string | null
          preco_kg: number
          quantidade_kg: number
          status?: string
          updated_at?: string
          user_id: string
          valor_total: number
          viveiro_id?: string | null
        }
        Update: {
          caixa_lancamento_id?: string | null
          created_at?: string
          data_despesca?: string
          id?: string
          observacao?: string | null
          preco_kg?: number
          quantidade_kg?: number
          status?: string
          updated_at?: string
          user_id?: string
          valor_total?: number
          viveiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "despescas_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
      }
      estoque_entradas: {
        Row: {
          created_at: string
          custo_total: number | null
          data_entrada: string
          fornecedor: string | null
          id: string
          observacao: string | null
          preco_unidade: number | null
          produto_id: string
          quantidade: number
          unidade: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          custo_total?: number | null
          data_entrada?: string
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          preco_unidade?: number | null
          produto_id: string
          quantidade: number
          unidade?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          custo_total?: number | null
          data_entrada?: string
          fornecedor?: string | null
          id?: string
          observacao?: string | null
          preco_unidade?: number | null
          produto_id?: string
          quantidade?: number
          unidade?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "estoque_entradas_produto_id_fkey"
            columns: ["produto_id"]
            isOneToOne: false
            referencedRelation: "produtos"
            referencedColumns: ["id"]
          },
        ]
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
      funcionarios: {
        Row: {
          ativo: boolean
          created_at: string
          id: string
          nome: string
          observacao: string | null
          salario: number
          updated_at: string
          user_id: string
          viveiro_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome: string
          observacao?: string | null
          salario?: number
          updated_at?: string
          user_id: string
          viveiro_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          id?: string
          nome?: string
          observacao?: string | null
          salario?: number
          updated_at?: string
          user_id?: string
          viveiro_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "funcionarios_viveiro_id_fkey"
            columns: ["viveiro_id"]
            isOneToOne: false
            referencedRelation: "viveiros"
            referencedColumns: ["id"]
          },
        ]
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
      pdf_shares: {
        Row: {
          created_at: string
          filename: string | null
          signed_url: string
          token: string
          user_id: string
        }
        Insert: {
          created_at?: string
          filename?: string | null
          signed_url: string
          token: string
          user_id: string
        }
        Update: {
          created_at?: string
          filename?: string | null
          signed_url?: string
          token?: string
          user_id?: string
        }
        Relationships: []
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
      relatorio_shares: {
        Row: {
          created_at: string
          id: string
          titulo: string | null
          token: string
          user_id: string
          viveiro_ids: string[] | null
        }
        Insert: {
          created_at?: string
          id?: string
          titulo?: string | null
          token?: string
          user_id: string
          viveiro_ids?: string[] | null
        }
        Update: {
          created_at?: string
          id?: string
          titulo?: string | null
          token?: string
          user_id?: string
          viveiro_ids?: string[] | null
        }
        Relationships: []
      }
      socios: {
        Row: {
          created_at: string
          id: string
          nome: string
          observacao: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          nome: string
          observacao?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          nome?: string
          observacao?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_access: {
        Row: {
          created_at: string
          email: string | null
          expires_at: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          expires_at?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      vales: {
        Row: {
          created_at: string
          data_vale: string
          funcionario_id: string
          id: string
          motivo: string | null
          updated_at: string
          user_id: string
          valor: number
        }
        Insert: {
          created_at?: string
          data_vale?: string
          funcionario_id: string
          id?: string
          motivo?: string | null
          updated_at?: string
          user_id: string
          valor: number
        }
        Update: {
          created_at?: string
          data_vale?: string
          funcionario_id?: string
          id?: string
          motivo?: string | null
          updated_at?: string
          user_id?: string
          valor?: number
        }
        Relationships: [
          {
            foreignKeyName: "vales_funcionario_id_fkey"
            columns: ["funcionario_id"]
            isOneToOne: false
            referencedRelation: "funcionarios"
            referencedColumns: ["id"]
          },
        ]
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
      get_pdf_share: { Args: { _token: string }; Returns: Json }
      get_relatorio_share_bundle: { Args: { _token: string }; Returns: Json }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "user"
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
      app_role: ["admin", "user"],
    },
  },
} as const
