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
      avisos_vistos: {
        Row: { usuario_id: string; clave: string; visto_at: string }
        Insert: { usuario_id: string; clave: string; visto_at?: string }
        Update: { usuario_id?: string; clave?: string; visto_at?: string }
        Relationships: [
          {
            foreignKeyName: "avisos_vistos_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      ajuste_items: {
        Row: {
          ajuste_id: string
          cantidad: number
          id: string
          item_id: string
          stock_antes: number | null
          stock_despues: number | null
          tipo: string
        }
        Insert: never
        Update: never
        Relationships: [
          { foreignKeyName: "ajuste_items_ajuste_id_fkey"; columns: ["ajuste_id"]; isOneToOne: false; referencedRelation: "ajustes_inventario"; referencedColumns: ["id"] },
          { foreignKeyName: "ajuste_items_item_id_fkey"; columns: ["item_id"]; isOneToOne: false; referencedRelation: "items"; referencedColumns: ["id"] },
        ]
      }
      ajustes_inventario: {
        Row: {
          anulado: boolean
          anulado_at: string | null
          anulado_por: string | null
          clase: string
          created_at: string
          emisor: Json | null
          fecha: string
          id: string
          motivo: string
          motivo_anulacion: string | null
          numero: number
          observaciones: string | null
          punto_venta: number
          referencia: string | null
          usuario_id: string
        }
        Insert: never
        Update: never
        Relationships: []
      }
      audit_log: {
        Row: {
          accion: string
          created_at: string
          datos_anteriores: Json | null
          datos_nuevos: Json | null
          descripcion: string | null
          id: number
          registro_id: string
          tabla: string
          usuario_email: string | null
          usuario_id: string | null
          usuario_nombre: string | null
        }
        Insert: {
          accion: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion?: string | null
          id?: never
          registro_id: string
          tabla: string
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Update: {
          accion?: string
          created_at?: string
          datos_anteriores?: Json | null
          datos_nuevos?: Json | null
          descripcion?: string | null
          id?: never
          registro_id?: string
          tabla?: string
          usuario_email?: string | null
          usuario_id?: string | null
          usuario_nombre?: string | null
        }
        Relationships: []
      }
      comisionistas: {
        Row: {
          activo: boolean | null
          campos_extra: Json | null
          celular: string | null
          email: string | null
          empresa: string | null
          id: string
          localidad: string | null
          modificado_por: string | null
          nombre: string
          notas: string | null
          provincia: string | null
          telefono: string | null
          updated_at: string | null
          zona: string | null
        }
        Insert: {
          activo?: boolean | null
          campos_extra?: Json | null
          celular?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          localidad?: string | null
          modificado_por?: string | null
          nombre: string
          notas?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Update: {
          activo?: boolean | null
          campos_extra?: Json | null
          celular?: string | null
          email?: string | null
          empresa?: string | null
          id?: string
          localidad?: string | null
          modificado_por?: string | null
          nombre?: string
          notas?: string | null
          provincia?: string | null
          telefono?: string | null
          updated_at?: string | null
          zona?: string | null
        }
        Relationships: []
      }
      configuracion: {
        Row: {
          color_deposito: string | null
          color_primario: string | null
          zona_horaria: string
          comisionistas_campos_custom: Json | null
          empresa_direccion: string | null
          empresa_cuit: string | null
          empresa_email: string | null
          empresa_nombre: string | null
          empresa_razon_social: string | null
          empresa_telefono: string | null
          empresa_web: string | null
          id: number
          inicial_cerrada_at: string | null
          logo_base64: string | null
          rotulo_campos: Json | null
          rotulo_design: Json | null
          rotulo_diseno_id: number | null
          rotulo_pie: string | null
        }
        Insert: {
          color_deposito?: string | null
          color_primario?: string | null
          zona_horaria?: string
          comisionistas_campos_custom?: Json | null
          empresa_direccion?: string | null
          empresa_cuit?: string | null
          empresa_email?: string | null
          empresa_nombre?: string | null
          empresa_razon_social?: string | null
          empresa_telefono?: string | null
          empresa_web?: string | null
          id?: number
          inicial_cerrada_at?: string | null
          logo_base64?: string | null
          rotulo_campos?: Json | null
          rotulo_design?: Json | null
          rotulo_diseno_id?: number | null
          rotulo_pie?: string | null
        }
        Update: {
          color_deposito?: string | null
          color_primario?: string | null
          zona_horaria?: string
          comisionistas_campos_custom?: Json | null
          empresa_direccion?: string | null
          empresa_cuit?: string | null
          empresa_email?: string | null
          empresa_nombre?: string | null
          empresa_razon_social?: string | null
          empresa_telefono?: string | null
          empresa_web?: string | null
          id?: number
          inicial_cerrada_at?: string | null
          logo_base64?: string | null
          rotulo_campos?: Json | null
          rotulo_design?: Json | null
          rotulo_diseno_id?: number | null
          rotulo_pie?: string | null
        }
        Relationships: []
      }
      contactos: {
        Row: {
          cargo: string | null
          celular: string | null
          created_at: string | null
          email: string | null
          id: string
          nombre: string
          proveedor_id: string | null
          telefono: string | null
        }
        Insert: {
          cargo?: string | null
          celular?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nombre: string
          proveedor_id?: string | null
          telefono?: string | null
        }
        Update: {
          cargo?: string | null
          celular?: string | null
          created_at?: string | null
          email?: string | null
          id?: string
          nombre?: string
          proveedor_id?: string | null
          telefono?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contactos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      equipo_items: {
        Row: {
          equipo_id: string
          item_id: string
        }
        Insert: {
          equipo_id: string
          item_id: string
        }
        Update: {
          equipo_id?: string
          item_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equipo_items_equipo_id_fkey"
            columns: ["equipo_id"]
            isOneToOne: false
            referencedRelation: "equipos"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equipo_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
        ]
      }
      equipos: {
        Row: {
          created_at: string
          datos_tecnicos: string | null
          id: string
          manual_url: string | null
          nombre: string
          sector: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          datos_tecnicos?: string | null
          id?: string
          manual_url?: string | null
          nombre: string
          sector: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          datos_tecnicos?: string | null
          id?: string
          manual_url?: string | null
          nombre?: string
          sector?: string
          updated_at?: string
        }
        Relationships: []
      }
      depositos: {
        Row: {
          activo: boolean
          codigo: string
          color: string | null
          created_at: string
          es_principal: boolean
          icono: string
          id: string
          nombre: string
          prefijo: string
          punto_venta: number
        }
        Insert: {
          activo?: boolean
          codigo: string
          color?: string | null
          created_at?: string
          es_principal?: boolean
          icono?: string
          id?: string
          nombre: string
          prefijo: string
          punto_venta?: number
        }
        Update: {
          activo?: boolean
          codigo?: string
          color?: string | null
          created_at?: string
          es_principal?: boolean
          icono?: string
          id?: string
          nombre?: string
          prefijo?: string
          punto_venta?: number
        }
        Relationships: []
      }
      error_logs: {
        Row: {
          created_at: string
          id: string
          mensaje: string
          pantalla: string | null
          stack: string | null
          url: string | null
          user_agent: string | null
          usuario_email: string | null
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensaje: string
          pantalla?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensaje?: string
          pantalla?: string | null
          stack?: string | null
          url?: string | null
          user_agent?: string | null
          usuario_email?: string | null
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "error_logs_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      familias: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      item_proveedores: {
        Row: {
          created_at: string
          id: string
          item_id: string
          proveedor_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          proveedor_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          proveedor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "item_proveedores_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "item_proveedores_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      items: {
        Row: {
          activo: boolean
          codigo: string
          created_at: string
          descripcion: string
          detalles: string | null
          eliminado_at: string | null
          eliminado_por: string | null
          estado_reposicion: string | null
          estado_reposicion_at: string | null
          familia_id: string
          foto_pendiente: boolean
          foto_pendiente_2: boolean
          foto_pendiente_3: boolean
          foto_subida_at: string | null
          foto_subida_at_2: string | null
          foto_subida_at_3: string | null
          foto_subida_por: string | null
          foto_subida_por_2: string | null
          foto_subida_por_3: string | null
          foto_url: string | null
          foto_url_2: string | null
          foto_url_3: string | null
          id: string
          numero: string
          punto_pedido: number
          stock: number | null
          stock_minimo: number
          subfamilia_id: string
          ubicacion: string | null
          unidad: string
          updated_at: string
        }
        Insert: {
          activo?: boolean
          codigo: string
          created_at?: string
          descripcion: string
          detalles?: string | null
          eliminado_at?: string | null
          eliminado_por?: string | null
          estado_reposicion?: string | null
          estado_reposicion_at?: string | null
          familia_id: string
          foto_pendiente?: boolean
          foto_pendiente_2?: boolean
          foto_pendiente_3?: boolean
          foto_subida_at?: string | null
          foto_subida_at_2?: string | null
          foto_subida_at_3?: string | null
          foto_subida_por?: string | null
          foto_subida_por_2?: string | null
          foto_subida_por_3?: string | null
          foto_url?: string | null
          foto_url_2?: string | null
          foto_url_3?: string | null
          id?: string
          numero: string
          punto_pedido?: number
          stock?: number | null
          stock_minimo?: number
          subfamilia_id: string
          ubicacion?: string | null
          unidad?: string
          updated_at?: string
        }
        Update: {
          activo?: boolean
          codigo?: string
          created_at?: string
          descripcion?: string
          detalles?: string | null
          eliminado_at?: string | null
          eliminado_por?: string | null
          estado_reposicion?: string | null
          estado_reposicion_at?: string | null
          familia_id?: string
          foto_pendiente?: boolean
          foto_pendiente_2?: boolean
          foto_pendiente_3?: boolean
          foto_subida_at?: string | null
          foto_subida_at_2?: string | null
          foto_subida_at_3?: string | null
          foto_subida_por?: string | null
          foto_subida_por_2?: string | null
          foto_subida_por_3?: string | null
          foto_url?: string | null
          foto_url_2?: string | null
          foto_url_3?: string | null
          id?: string
          numero?: string
          punto_pedido?: number
          stock?: number | null
          stock_minimo?: number
          subfamilia_id?: string
          ubicacion?: string | null
          unidad?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "items_eliminado_por_fkey"
            columns: ["eliminado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_foto_subida_por_2_fkey"
            columns: ["foto_subida_por_2"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_foto_subida_por_3_fkey"
            columns: ["foto_subida_por_3"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_foto_subida_por_fkey"
            columns: ["foto_subida_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "items_subfamilia_id_fkey"
            columns: ["subfamilia_id"]
            isOneToOne: false
            referencedRelation: "subfamilias"
            referencedColumns: ["id"]
          },
        ]
      }
      licencia: {
        Row: {
          actualizada_at: string
          componentes: string[]
          id: number
          max_depositos: number
          modulos: Json
        }
        Insert: {
          actualizada_at?: string
          componentes?: string[]
          id?: number
          max_depositos?: number
          modulos?: Json
        }
        Update: {
          actualizada_at?: string
          componentes?: string[]
          id?: number
          max_depositos?: number
          modulos?: Json
        }
        Relationships: []
      }
      preferencias_modulos: {
        Row: {
          actualizado_at: string | null
          actualizado_por: string | null
          apagados: Json
          id: number
        }
        Insert: {
          actualizado_at?: string | null
          actualizado_por?: string | null
          apagados?: Json
          id?: number
        }
        Update: {
          actualizado_at?: string | null
          actualizado_por?: string | null
          apagados?: Json
          id?: number
        }
        Relationships: []
      }
      migraciones_aplicadas: {
        Row: {
          aplicada_at: string
          nombre: string
        }
        Insert: {
          aplicada_at?: string
          nombre: string
        }
        Update: {
          aplicada_at?: string
          nombre?: string
        }
        Relationships: []
      }
      planilla_familias: {
        Row: {
          actualizada_at: string
          actualizada_por: string | null
          id: boolean
          nombre_archivo: string
          storage_path: string
        }
        Insert: {
          actualizada_at?: string
          actualizada_por?: string | null
          id?: boolean
          nombre_archivo: string
          storage_path: string
        }
        Update: {
          actualizada_at?: string
          actualizada_por?: string | null
          id?: boolean
          nombre_archivo?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "planilla_familias_actualizada_por_fkey"
            columns: ["actualizada_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      proveedores: {
        Row: {
          activo: boolean | null
          codigo_postal: string | null
          created_at: string | null
          direccion: string | null
          eliminado: boolean
          eliminado_at: string | null
          eliminado_por: string | null
          email: string | null
          horario: string | null
          id: string
          localidad: string | null
          modificado_por: string | null
          nombre: string
          notas: string | null
          provincia: string | null
          rubro: string | null
          updated_at: string | null
        }
        Insert: {
          activo?: boolean | null
          codigo_postal?: string | null
          created_at?: string | null
          direccion?: string | null
          eliminado?: boolean
          eliminado_at?: string | null
          eliminado_por?: string | null
          email?: string | null
          horario?: string | null
          id?: string
          localidad?: string | null
          modificado_por?: string | null
          nombre: string
          notas?: string | null
          provincia?: string | null
          rubro?: string | null
          updated_at?: string | null
        }
        Update: {
          activo?: boolean | null
          codigo_postal?: string | null
          created_at?: string | null
          direccion?: string | null
          eliminado?: boolean
          eliminado_at?: string | null
          eliminado_por?: string | null
          email?: string | null
          horario?: string | null
          id?: string
          localidad?: string | null
          modificado_por?: string | null
          nombre?: string
          notas?: string | null
          provincia?: string | null
          rubro?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "proveedores_eliminado_por_fkey"
            columns: ["eliminado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      reparacion_entregas: {
        Row: {
          cantidad_devuelta: number
          created_at: string
          fecha_entrega: string
          id: string
          registrado_por: string
          remito_fecha: string | null
          remito_numero: string | null
          remito_punto_venta: string | null
          reparacion_item_id: string
          repone_stock: boolean
          resultado: string
        }
        Insert: {
          cantidad_devuelta: number
          created_at?: string
          fecha_entrega: string
          id?: string
          registrado_por: string
          remito_fecha?: string | null
          remito_numero?: string | null
          remito_punto_venta?: string | null
          reparacion_item_id: string
          repone_stock?: boolean
          resultado: string
        }
        Update: {
          cantidad_devuelta?: number
          created_at?: string
          fecha_entrega?: string
          id?: string
          registrado_por?: string
          remito_fecha?: string | null
          remito_numero?: string | null
          remito_punto_venta?: string | null
          reparacion_item_id?: string
          repone_stock?: boolean
          resultado?: string
        }
        Relationships: [
          {
            foreignKeyName: "reparacion_entregas_registrado_por_fkey"
            columns: ["registrado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparacion_entregas_reparacion_item_id_fkey"
            columns: ["reparacion_item_id"]
            isOneToOne: false
            referencedRelation: "reparacion_items"
            referencedColumns: ["id"]
          },
        ]
      }
      reparacion_items: {
        Row: {
          cantidad: number
          descuenta_stock: boolean
          id: string
          item_id: string
          reparacion_id: string
        }
        Insert: {
          cantidad: number
          descuenta_stock?: boolean
          id?: string
          item_id: string
          reparacion_id: string
        }
        Update: {
          cantidad?: number
          descuenta_stock?: boolean
          id?: string
          item_id?: string
          reparacion_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reparacion_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparacion_items_reparacion_id_fkey"
            columns: ["reparacion_id"]
            isOneToOne: false
            referencedRelation: "reparaciones"
            referencedColumns: ["id"]
          },
        ]
      }
      reparaciones: {
        Row: {
          activo: boolean
          created_at: string
          eliminado_at: string | null
          eliminado_por: string | null
          envio_id: string | null
          fecha_salida: string
          id: string
          motivo: string
          orden_compra_fecha: string | null
          orden_compra_numero: string | null
          proveedor_id: string
          responsable_id: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          eliminado_at?: string | null
          eliminado_por?: string | null
          envio_id?: string | null
          fecha_salida: string
          id?: string
          motivo: string
          orden_compra_fecha?: string | null
          orden_compra_numero?: string | null
          proveedor_id: string
          responsable_id: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          eliminado_at?: string | null
          eliminado_por?: string | null
          envio_id?: string | null
          fecha_salida?: string
          id?: string
          motivo?: string
          orden_compra_fecha?: string | null
          orden_compra_numero?: string | null
          proveedor_id?: string
          responsable_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "reparaciones_eliminado_por_fkey"
            columns: ["eliminado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparaciones_envio_id_fkey"
            columns: ["envio_id"]
            isOneToOne: false
            referencedRelation: "rotulos_generados"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparaciones_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reparaciones_responsable_id_fkey"
            columns: ["responsable_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      retiro_items: {
        Row: {
          cantidad: number
          id: string
          item_id: string
          observacion: string | null
          retiro_id: string
        }
        Insert: {
          cantidad?: number
          id?: string
          item_id: string
          observacion?: string | null
          retiro_id: string
        }
        Update: {
          cantidad?: number
          id?: string
          item_id?: string
          observacion?: string | null
          retiro_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retiro_items_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "retiro_items_retiro_id_fkey"
            columns: ["retiro_id"]
            isOneToOne: false
            referencedRelation: "retiros"
            referencedColumns: ["id"]
          },
        ]
      }
      retiros: {
        Row: {
          created_at: string
          exportado: boolean
          id: string
          observacion_general: string | null
          sector_id: string
          usuario_id: string
        }
        Insert: {
          created_at?: string
          exportado?: boolean
          id?: string
          observacion_general?: string | null
          sector_id: string
          usuario_id: string
        }
        Update: {
          created_at?: string
          exportado?: boolean
          id?: string
          observacion_general?: string | null
          sector_id?: string
          usuario_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "retiros_sector_id_fkey"
            columns: ["sector_id"]
            isOneToOne: false
            referencedRelation: "sectores"
            referencedColumns: ["id"]
          },
        ]
      }
      rotulo_disenos: {
        Row: {
          campos: Json | null
          created_at: string
          design: Json
          id: number
          nombre: string
          pie: string | null
        }
        Insert: {
          campos?: Json | null
          created_at?: string
          design: Json
          id?: never
          nombre: string
          pie?: string | null
        }
        Update: {
          campos?: Json | null
          created_at?: string
          design?: Json
          id?: never
          nombre?: string
          pie?: string | null
        }
        Relationships: []
      }
      rotulos_bultos: {
        Row: {
          created_at: string
          detalle: string | null
          id: string
          numero: number
          rotulo_id: string
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          detalle?: string | null
          id?: string
          numero: number
          rotulo_id: string
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          detalle?: string | null
          id?: string
          numero?: number
          rotulo_id?: string
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rotulos_bultos_rotulo_id_fkey"
            columns: ["rotulo_id"]
            isOneToOne: false
            referencedRelation: "rotulos_generados"
            referencedColumns: ["id"]
          },
        ]
      }
      rotulos_fotos: {
        Row: {
          creado_por: string | null
          created_at: string
          grupo_id: string
          id: string
          proveedor_id: string
          storage_path: string
        }
        Insert: {
          creado_por?: string | null
          created_at?: string
          grupo_id: string
          id?: string
          proveedor_id: string
          storage_path: string
        }
        Update: {
          creado_por?: string | null
          created_at?: string
          grupo_id?: string
          id?: string
          proveedor_id?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "rotulos_fotos_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotulos_fotos_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      rotulos_generados: {
        Row: {
          alto_mm: number | null
          ancho_mm: number | null
          bulto_actual: number | null
          bulto_total: number | null
          comentario: string | null
          comisionista_id: string | null
          creado_por: string | null
          created_at: string
          design_snapshot: Json | null
          detalle: string | null
          eliminado: boolean
          eliminado_at: string | null
          eliminado_por: string | null
          extra: string | null
          grupo_id: string
          id: string
          motivo_edicion: string | null
          numero_documento: string | null
          proveedor_id: string
          storage_path: string | null
          tipo_documento: string | null
          valor_declarado: string | null
          version: number
          vigente: boolean
        }
        Insert: {
          alto_mm?: number | null
          ancho_mm?: number | null
          bulto_actual?: number | null
          bulto_total?: number | null
          comentario?: string | null
          comisionista_id?: string | null
          creado_por?: string | null
          created_at?: string
          design_snapshot?: Json | null
          detalle?: string | null
          eliminado?: boolean
          eliminado_at?: string | null
          eliminado_por?: string | null
          extra?: string | null
          grupo_id: string
          id?: string
          motivo_edicion?: string | null
          numero_documento?: string | null
          proveedor_id: string
          storage_path?: string | null
          tipo_documento?: string | null
          valor_declarado?: string | null
          version?: number
          vigente?: boolean
        }
        Update: {
          alto_mm?: number | null
          ancho_mm?: number | null
          bulto_actual?: number | null
          bulto_total?: number | null
          comentario?: string | null
          comisionista_id?: string | null
          creado_por?: string | null
          created_at?: string
          design_snapshot?: Json | null
          detalle?: string | null
          eliminado?: boolean
          eliminado_at?: string | null
          eliminado_por?: string | null
          extra?: string | null
          grupo_id?: string
          id?: string
          motivo_edicion?: string | null
          numero_documento?: string | null
          proveedor_id?: string
          storage_path?: string | null
          tipo_documento?: string | null
          valor_declarado?: string | null
          version?: number
          vigente?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "rotulos_generados_comisionista_id_fkey"
            columns: ["comisionista_id"]
            isOneToOne: false
            referencedRelation: "comisionistas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotulos_generados_creado_por_fkey"
            columns: ["creado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotulos_generados_eliminado_por_fkey"
            columns: ["eliminado_por"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rotulos_generados_proveedor_id_fkey"
            columns: ["proveedor_id"]
            isOneToOne: false
            referencedRelation: "proveedores"
            referencedColumns: ["id"]
          },
        ]
      }
      sectores: {
        Row: {
          activo: boolean
          created_at: string
          id: string
          nombre: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          id?: string
          nombre?: string
        }
        Relationships: []
      }
      subfamilias: {
        Row: {
          codigo: string
          created_at: string
          familia_id: string
          id: string
          nombre: string
        }
        Insert: {
          codigo: string
          created_at?: string
          familia_id: string
          id?: string
          nombre: string
        }
        Update: {
          codigo?: string
          created_at?: string
          familia_id?: string
          id?: string
          nombre?: string
        }
        Relationships: [
          {
            foreignKeyName: "subfamilias_familia_id_fkey"
            columns: ["familia_id"]
            isOneToOne: false
            referencedRelation: "familias"
            referencedColumns: ["id"]
          },
        ]
      }
      sugerencias: {
        Row: {
          created_at: string
          id: string
          mensaje: string
          usuario_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          mensaje: string
          usuario_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          mensaje?: string
          usuario_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sugerencias_usuario_id_fkey"
            columns: ["usuario_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      task_history: {
        Row: {
          action: string
          created_at: string
          id: string
          note: string | null
          task_id: string
          user_id: string
        }
        Insert: {
          action: string
          created_at?: string
          id?: string
          note?: string | null
          task_id: string
          user_id: string
        }
        Update: {
          action?: string
          created_at?: string
          id?: string
          note?: string | null
          task_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "task_history_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "task_history_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_date: string
          cancelled_at: string | null
          carry_count: number
          completed_at: string | null
          created_at: string
          description: string | null
          id: string
          is_stagnant: boolean
          pending_days: number
          start_date: string
          status: string
          title: string
          traffic_level: string
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_date?: string
          cancelled_at?: string | null
          carry_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_stagnant?: boolean
          pending_days?: number
          start_date?: string
          status?: string
          title: string
          traffic_level?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_date?: string
          cancelled_at?: string | null
          carry_count?: number
          completed_at?: string | null
          created_at?: string
          description?: string | null
          id?: string
          is_stagnant?: boolean
          pending_days?: number
          start_date?: string
          status?: string
          title?: string
          traffic_level?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "usuarios_perfil"
            referencedColumns: ["id"]
          },
        ]
      }
      usuarios_perfil: {
        Row: {
          access_expires_at: string | null
          access_status: string
          activo: boolean | null
          apellido: string | null
          created_at: string | null
          email: string | null
          es_owner: boolean
          id: string
          last_login_at: string | null
          mantenimiento_rol: string | null
          nombre: string | null
          puede_ajustar_inventario: boolean
          puede_gestionar_depositos: boolean
          puede_resetear_contrasenas: boolean
          puede_ver_errores: boolean
          puede_ver_retiros: boolean
          puede_ver_sugerencias: boolean
          rol: string | null
          updated_at: string | null
        }
        Insert: {
          access_expires_at?: string | null
          access_status?: string
          activo?: boolean | null
          apellido?: string | null
          created_at?: string | null
          email?: string | null
          es_owner?: boolean
          id: string
          last_login_at?: string | null
          mantenimiento_rol?: string | null
          nombre?: string | null
          puede_ajustar_inventario?: boolean
          puede_gestionar_depositos?: boolean
          puede_resetear_contrasenas?: boolean
          puede_ver_errores?: boolean
          puede_ver_retiros?: boolean
          puede_ver_sugerencias?: boolean
          rol?: string | null
          updated_at?: string | null
        }
        Update: {
          access_expires_at?: string | null
          access_status?: string
          activo?: boolean | null
          apellido?: string | null
          created_at?: string | null
          email?: string | null
          es_owner?: boolean
          id?: string
          last_login_at?: string | null
          mantenimiento_rol?: string | null
          nombre?: string | null
          puede_ajustar_inventario?: boolean
          puede_gestionar_depositos?: boolean
          puede_resetear_contrasenas?: boolean
          puede_ver_errores?: boolean
          puede_ver_retiros?: boolean
          puede_ver_sugerencias?: boolean
          rol?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      marcar_aviso_visto: { Args: { p_clave: string }; Returns: string }
      _aud_actor: { Args: never; Returns: Record<string, unknown> }
      _aud_cambio: {
        Args: { anterior: string; etiqueta: string; nuevo: string }
        Returns: string
      }
      agregar_dueno: { Args: { p_id: string }; Returns: undefined }
      can_view_all_retiros: { Args: never; Returns: boolean }
      can_view_errores: { Args: never; Returns: boolean }
      can_view_papelera: { Args: never; Returns: boolean }
      can_view_sugerencias: { Args: never; Returns: boolean }
      cancel_task: { Args: { p_task_id: string }; Returns: undefined }
      complete_task: { Args: { p_task_id: string }; Returns: undefined }
      confirmar_retiro: {
        Args: { p_lineas: Json; p_observacion: string; p_sector_id: string }
        Returns: string
      }
      crear_deposito: {
        Args: {
          p_color?: string | null
          p_icono?: string
          p_nombre: string
          p_prefijo: string
        }
        Returns: Database['public']['Tables']['depositos']['Row']
      }
      can_gestionar_depositos: { Args: never; Returns: boolean }
      depositos_del_usuario: { Args: never; Returns: string[] }
      editar_deposito: {
        Args: {
          p_activo: boolean
          p_color: string | null
          p_icono: string
          p_id: string
          p_nombre: string
          p_prefijo?: string | null
        }
        Returns: Database['public']['Tables']['depositos']['Row']
      }
      crear_repuesto: {
        Args: {
          p_descripcion: string
          p_detalles: string
          p_familia_id: string
          p_numero: string
          p_punto_pedido: number
          p_stock: number
          p_stock_minimo: number
          p_subfamilia_id: string
          p_ubicacion: string
          p_unidad: string
        }
        Returns: Database['public']['Tables']['items']['Row']
      }
      crear_reparacion: {
        Args: {
          p_envio_id: string
          p_fecha_salida: string
          p_items: Json
          p_motivo: string
          p_proveedor_id: string
        }
        Returns: string
      }
      create_task: {
        Args: {
          p_assigned_date?: string
          p_description?: string
          p_title: string
          p_traffic_level?: string
        }
        Returns: string
      }
      definir_dueno_inicial: { Args: { p_email: string }; Returns: undefined }
      definir_modulo_del_dueno: {
        Args: { p_apagado: boolean; p_modulo: string }
        Returns: undefined
      }
      eliminar_reparacion: {
        Args: { p_reparacion_id: string }
        Returns: undefined
      }
      exigir_modulo: { Args: { p_modulos: string[] }; Returns: undefined }
      get_user_task_counts: {
        Args: { target_user_id: string }
        Returns: {
          cancelled: number
          completed: number
          pending: number
          stagnant: number
          total: number
        }[]
      }
      anular_ajuste_inventario: { Args: { p_ajuste_id: string; p_motivo: string }; Returns: undefined }
      can_ajustar_inventario: { Args: never; Returns: boolean }
      aplicar_importacion_stock: { Args: { p_filas: Json }; Returns: Json }
      // (la base devuelve { documentos: [ids], lineas: n })
      comprobante_texto: { Args: { p_clase: string; p_numero: number; p_punto_venta: number }; Returns: string }
      crear_ajuste_inventario: { Args: { p_lineas: Json; p_motivo: string }; Returns: string }
      crear_movimiento_stock: {
        Args: { p_clase: string; p_fecha: string; p_lineas: Json; p_motivo: string; p_observaciones: string; p_referencia: string }
        Returns: Json
      }
      repuestos_a_reponer: {
        Args: { p_texto?: string; p_familia_id?: string; p_estado?: string; p_limite?: number }
        Returns: {
          id: string
          codigo: string
          numero: string
          descripcion: string
          detalles: string | null
          stock: number | null
          stock_minimo: number
          punto_pedido: number
          familia_id: string
          subfamilia_id: string
          estado_reposicion: string | null
          total: number
          total_sin_stock: number
        }[]
      }
      historial_de_retiros: {
        Args: { p_texto?: string; p_desde?: string; p_hasta?: string; p_usuario?: string; p_antes_en?: string; p_antes_id?: string; p_limite?: number }
        Returns: { id: string; usuario_id: string; created_at: string; observacion_general: string | null; sector: string | null; lineas: Json }[]
      }
      lista_de_movimientos: {
        Args: { p_texto?: string; p_filtro?: string; p_desde?: string; p_hasta?: string; p_antes_en?: string; p_antes_id?: string; p_limite?: number }
        Returns: {
          id: string; created_at: string; usuario_id: string; clase: string; fecha: string; punto_venta: number; numero: number; referencia: string | null
          observaciones: string | null; motivo: string; anulado: boolean; anulado_por: string | null; anulado_at: string | null; motivo_anulacion: string | null; lineas: Json
        }[]
      }
      buscar_repuestos: {
        Args: { p_texto: string; p_limite?: number; p_familia_id?: string; p_subfamilia_id?: string }
        Returns: {
          id: string
          codigo: string
          numero: string
          descripcion: string
          detalles: string | null
          ubicacion: string | null
          stock: number | null
          stock_minimo: number
          punto_pedido: number
          familia_id: string
          subfamilia_id: string
          foto_url: string | null
          puntaje: number
        }[]
      }
      ficha_de_stock: {
        Args: { p_antes?: number; p_item_id: string; p_limite?: number }
        Returns: {
          comprobante: string | null
          created_at: string
          detalle: string
          entrada: number
          existencia: number | null
          id: number
          motivo: string | null
          referencia: string | null
          salida: number
          sector: string | null
          tipo: string
          usuario_id: string | null
        }[]
      }
      historial_ajustes_por_item: {
        Args: { p_item_id: string }
        Returns: {
          anulado: boolean
          anulado_at: string | null
          cantidad: number
          clase: string
          created_at: string
          id: string
          motivo: string
          motivo_anulacion: string | null
          numero: number
          punto_venta: number
          referencia: string | null
          stock_antes: number | null
          stock_despues: number | null
          tipo: string
          usuario_id: string
        }[]
      }
      has_active_access: { Args: { user_uuid: string }; Returns: boolean }
      historial_retiros_por_item: {
        Args: { p_item_id: string }
        Returns: {
          cantidad: number
          created_at: string
          id: string
          observacion: string
          sector: string
          usuario_id: string
        }[]
      }
      is_admin: { Args: { user_uuid: string }; Returns: boolean }
      is_directorio_admin: { Args: never; Returns: boolean }
      is_mantenimiento_admin: { Args: never; Returns: boolean }
      is_owner: { Args: never; Returns: boolean }
      modulo_activo: { Args: { p_modulo: string }; Returns: boolean }
      modulo_requisitos: { Args: never; Returns: Json }
      usuario_activo: { Args: never; Returns: boolean }
      hoy_local: { Args: never; Returns: string }
      fecha_local: { Args: { p: string }; Returns: string }
      zona_horaria_valida: { Args: { p: string }; Returns: boolean }
      process_pending_tasks_for_user: {
        Args: { target_user_id: string }
        Returns: number
      }
      quitar_dueno: { Args: { p_id: string }; Returns: undefined }
      reparacion_item_pendiente: {
        Args: { p_reparacion_item_id: string }
        Returns: number
      }
      reprogram_task: {
        Args: { p_new_assigned_date: string; p_task_id: string }
        Returns: undefined
      }
      restaurar_reparacion: {
        Args: { p_reparacion_id: string }
        Returns: undefined
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      tiene_acceso_mantenimiento: { Args: never; Returns: boolean }
      update_task: {
        Args: {
          p_description: string
          p_task_id: string
          p_title: string
          p_traffic_level: string
        }
        Returns: undefined
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
    Enums: {},
  },
} as const
