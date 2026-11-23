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
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      banners: {
        Row: {
          ativo: boolean
          created_at: string
          fim: string | null
          id: string
          imagem_url: string
          inicio: string | null
          link_tipo: string
          link_valor: string
          ordem: number
          subtitulo: string
          titulo: string
          vendedor_id: string | null
        }
        Insert: {
          ativo?: boolean
          created_at?: string
          fim?: string | null
          id?: string
          imagem_url?: string
          inicio?: string | null
          link_tipo?: string
          link_valor?: string
          ordem?: number
          subtitulo?: string
          titulo?: string
          vendedor_id?: string | null
        }
        Update: {
          ativo?: boolean
          created_at?: string
          fim?: string | null
          id?: string
          imagem_url?: string
          inicio?: string | null
          link_tipo?: string
          link_valor?: string
          ordem?: number
          subtitulo?: string
          titulo?: string
          vendedor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "banners_vendedor_id_fkey"
            columns: ["vendedor_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      category_order: {
        Row: {
          id: string
          nome: string
          posicao: number
          tipo: string
        }
        Insert: {
          id?: string
          nome: string
          posicao?: number
          tipo: string
        }
        Update: {
          id?: string
          nome?: string
          posicao?: number
          tipo?: string
        }
        Relationships: []
      }
      image_library: {
        Row: {
          foto: string
          key: string
          updated_at: string
        }
        Insert: {
          foto: string
          key: string
          updated_at?: string
        }
        Update: {
          foto?: string
          key?: string
          updated_at?: string
        }
        Relationships: []
      }
      product_min_prices: {
        Row: {
          min_price: number
          product_row: number
          updated_at: string
        }
        Insert: {
          min_price: number
          product_row: number
          updated_at?: string
        }
        Update: {
          min_price?: number
          product_row?: number
          updated_at?: string
        }
        Relationships: []
      }
      product_variants: {
        Row: {
          cor: string
          cor_hex: string
          created_at: string
          custo: number
          disponivel: boolean
          id: string
          imagem_url: string | null
          lucro: number
          ordem: number
          preco_venda: number
          product_id: number
        }
        Insert: {
          cor?: string
          cor_hex?: string
          created_at?: string
          custo?: number
          disponivel?: boolean
          id?: string
          imagem_url?: string | null
          lucro?: number
          ordem?: number
          preco_venda?: number
          product_id: number
        }
        Update: {
          cor?: string
          cor_hex?: string
          created_at?: string
          custo?: number
          disponivel?: boolean
          id?: string
          imagem_url?: string | null
          lucro?: number
          ordem?: number
          preco_venda?: number
          product_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["row"]
          },
        ]
      }
      products: {
        Row: {
          categoria: string
          categoria_pai: string
          created_at: string
          custo: number
          destaque: boolean
          estoque: number
          foto: string
          lucro: number
          lucro_tipo: string
          modelo: string
          row: number
          updated_at: string
          variacao: string
          venda: number
        }
        Insert: {
          categoria?: string
          categoria_pai?: string
          created_at?: string
          custo?: number
          destaque?: boolean
          estoque?: number
          foto?: string
          lucro?: number
          lucro_tipo?: string
          modelo: string
          row?: number
          updated_at?: string
          variacao?: string
          venda?: number
        }
        Update: {
          categoria?: string
          categoria_pai?: string
          created_at?: string
          custo?: number
          destaque?: boolean
          estoque?: number
          foto?: string
          lucro?: number
          lucro_tipo?: string
          modelo?: string
          row?: number
          updated_at?: string
          variacao?: string
          venda?: number
        }
        Relationships: []
      }
      promissory_installments: {
        Row: {
          client_row: number
          created_at: string
          data_pagamento: string | null
          forma_pagamento: string
          id: string
          numero: number
          periodicidade: string
          valor: number
          valor_pago: number | null
          vencimento: string
        }
        Insert: {
          client_row: number
          created_at?: string
          data_pagamento?: string | null
          forma_pagamento?: string
          id?: string
          numero: number
          periodicidade?: string
          valor: number
          valor_pago?: number | null
          vencimento: string
        }
        Update: {
          client_row?: number
          created_at?: string
          data_pagamento?: string | null
          forma_pagamento?: string
          id?: string
          numero?: number
          periodicidade?: string
          valor?: number
          valor_pago?: number | null
          vencimento?: string
        }
        Relationships: []
      }
      quotes: {
        Row: {
          cliente_nome: string
          cliente_whatsapp: string
          created_at: string
          entrada: number
          id: string
          items: Json
          observacoes: string
          rates: string
          seller_id: string
          status: string
          user_id: string
          validade: string
        }
        Insert: {
          cliente_nome: string
          cliente_whatsapp: string
          created_at?: string
          entrada?: number
          id?: string
          items?: Json
          observacoes?: string
          rates?: string
          seller_id: string
          status?: string
          user_id: string
          validade: string
        }
        Update: {
          cliente_nome?: string
          cliente_whatsapp?: string
          created_at?: string
          entrada?: number
          id?: string
          items?: Json
          observacoes?: string
          rates?: string
          seller_id?: string
          status?: string
          user_id?: string
          validade?: string
        }
        Relationships: [
          {
            foreignKeyName: "quotes_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "sellers"
            referencedColumns: ["id"]
          },
        ]
      }
      radar_results: {
        Row: {
          analyzed_at: string
          consulta: string
          ofertas: Json
          product_row: number
        }
        Insert: {
          analyzed_at?: string
          consulta?: string
          ofertas?: Json
          product_row: number
        }
        Update: {
          analyzed_at?: string
          consulta?: string
          ofertas?: Json
          product_row?: number
        }
        Relationships: []
      }
      radar_settings: {
        Row: {
          delta_menor: number
          estrategia: string
          folga: number
          frete: number
          id: number
          imposto: number
          limite: number
          lucro_min: number
          updated_at: string
        }
        Insert: {
          delta_menor?: number
          estrategia?: string
          folga?: number
          frete?: number
          id?: number
          imposto?: number
          limite?: number
          lucro_min?: number
          updated_at?: string
        }
        Update: {
          delta_menor?: number
          estrategia?: string
          folga?: number
          frete?: number
          id?: number
          imposto?: number
          limite?: number
          lucro_min?: number
          updated_at?: string
        }
        Relationships: []
      }
      radar_snapshots: {
        Row: {
          created_at: string
          id: string
          mediana: number | null
          menor: number | null
          meu_preco: number
          n: number
          product_row: number
        }
        Insert: {
          created_at?: string
          id?: string
          mediana?: number | null
          menor?: number | null
          meu_preco?: number
          n?: number
          product_row: number
        }
        Update: {
          created_at?: string
          id?: string
          mediana?: number | null
          menor?: number | null
          meu_preco?: number
          n?: number
          product_row?: number
        }
        Relationships: []
      }
      radar_usage: {
        Row: {
          consultas: number
          created_at: string
          id: string
        }
        Insert: {
          consultas?: number
          created_at?: string
          id?: string
        }
        Update: {
          consultas?: number
          created_at?: string
          id?: string
        }
        Relationships: []
      }
      sellers: {
        Row: {
          active: boolean
          banner_modo: string
          categorias: string[]
          created_at: string
          email: string
          id: string
          nome: string
          product_rows: number[]
          rates: string
          slug: string
          user_id: string
          whatsapp: string
        }
        Insert: {
          active?: boolean
          banner_modo?: string
          categorias?: string[]
          created_at?: string
          email: string
          id?: string
          nome: string
          product_rows?: number[]
          rates?: string
          slug: string
          user_id: string
          whatsapp: string
        }
        Update: {
          active?: boolean
          banner_modo?: string
          categorias?: string[]
          created_at?: string
          email?: string
          id?: string
          nome?: string
          product_rows?: number[]
          rates?: string
          slug?: string
          user_id?: string
          whatsapp?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "admin" | "vendedor"
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
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
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
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
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
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
      app_role: ["admin", "vendedor"],
    },
  },
} as const
