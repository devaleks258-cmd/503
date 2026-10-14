import { supabase } from '@/lib/supabase'
import type {
  WarehouseStockRow,
  ToOrderRow,
  ApartmentGapRow,
  EventRow,
  StockMoveRow,
  NormRuleRow,
  CleaningEventRow,
  IssueMissingResult,
  Apartment,
  Building,
  Staff,
  Contact,
  Incident,
  Category,
  Item,
  ItemKind,
  BaseUnit,
  Supplier,
  DocumentRow,
  DocumentWithSupplier,
  AttachmentRow,
  PostDocumentResult,
  InventoryRow,
  InventoryWithApt,
  InventoryLineRow,
  InventoryCloseResult,
  InventoryScope,
  PurchaseOrderRow,
  POLineRow,
  POGenerateResult,
  POReceiveResult,
  POStatus,
} from '@/lib/database.types'

// ---- Queries ----

export async function fetchToOrder(): Promise<ToOrderRow[]> {
  const { data, error } = await supabase
    .from('to_order')
    .select('item_id,name,category,base_unit,pack_size,pack_label,qty,min_stock,shortage')
    .order('shortage', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchApartmentGaps(): Promise<ApartmentGapRow[]> {
  const { data, error } = await supabase
    .from('apartment_gap')
    .select('apartment_id,code,item_id,name,norm,actual,gap')
    .gt('gap', 0)
    .order('code')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchShortageEvents(): Promise<EventRow[]> {
  const { data, error } = await supabase
    .from('events')
    .select('id,type,payload,created_at,processed_at')
    .eq('type', 'shortage')
    .is('processed_at', null)
    .order('created_at', { ascending: false })
    .limit(20)
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchWarehouseStock(): Promise<WarehouseStockRow[]> {
  const { data, error } = await supabase
    .from('warehouse_stock')
    .select('item_id,name,category,kind,base_unit,pack_size,pack_label,qty,min_stock,below_min')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchStockMoves(itemId: number, offset = 0): Promise<StockMoveRow[]> {
  const { data, error } = await supabase
    .from('stock_moves')
    .select('id,item_id,from_loc,to_loc,qty,unit_cost,source_type,source_id,apartment_id,staff_id,note,moved_at,created_by')
    .eq('item_id', itemId)
    .order('moved_at', { ascending: false })
    .range(offset, offset + 49)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<StockMoveRow & { created_by: string | null }>
  const locationIds = Array.from(new Set(rows.flatMap((row) => [row.from_loc, row.to_loc])))
  const authorIds = Array.from(new Set(rows.map((row) => row.created_by).filter((id): id is string => id !== null)))
  const [locationsResult, profilesResult] = await Promise.all([
    locationIds.length ? supabase.from('locations').select('id,name,type').in('id', locationIds) : Promise.resolve({ data: [], error: null }),
    authorIds.length ? supabase.from('profiles').select('id,full_name,login').in('id', authorIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (locationsResult.error) throw new Error(locationsResult.error.message)
  if (profilesResult.error) throw new Error(profilesResult.error.message)
  const locationMap = new Map((locationsResult.data ?? []).map((location) => [location.id, location]))
  const profileMap = new Map((profilesResult.data ?? []).map((profile) => [profile.id, profile.full_name || profile.login]))
  return rows.map(({ created_by: createdBy, ...row }) => ({
    ...row,
    from_location: locationMap.get(row.from_loc),
    to_location: locationMap.get(row.to_loc),
    author: createdBy ? profileMap.get(createdBy) ?? null : null,
  }))
}

export async function fetchApartmentsAdmin(): Promise<Apartment[]> {
  const { data, error } = await supabase
    .from('apartments')
    .select('id,building_id,number,code,type,status,created_at')
    .order('code')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchBuildings(): Promise<Building[]> {
  const { data, error } = await supabase
    .from('buildings')
    .select('id,name')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchNormRules(apartmentId: number): Promise<NormRuleRow[]> {
  const { data, error } = await supabase
    .from('norm_rules')
    .select('id,norm_type,apt_type,apartment_id,item_id,qty,note')
    .eq('apartment_id', apartmentId)
    .order('norm_type')
    .order('item_id')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchTemplateNorms(aptType: string): Promise<NormRuleRow[]> {
  const { data, error } = await supabase
    .from('norm_rules')
    .select('id,norm_type,apt_type,apartment_id,item_id,qty,note')
    .eq('apt_type', aptType)
    .is('apartment_id', null)
    .order('norm_type')
    .order('item_id')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchCleaningEvents(apartmentId: number): Promise<CleaningEventRow[]> {
  const { data, error } = await supabase
    .from('cleaning_events')
    .select('id, apartment_id, cleaned_at, status, revision, note, lead_staff_id, reverse_reason, cleaning_event_staff(staff_id, staff(full_name))')
    .eq('apartment_id', apartmentId)
    .order('cleaned_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as unknown as Array<{
    id: string
    apartment_id: number
    cleaned_at: string
    status: CleaningEventRow['status']
    revision: number
    note: string | null
    lead_staff_id: number | null
    reverse_reason: string | null
    cleaning_event_staff: Array<{
      staff_id: number
      staff: { full_name: string } | { full_name: string }[]
    }>
  }>
  return rows.map((r) => ({
    ...r,
    cleaning_event_staff: (r.cleaning_event_staff ?? []).map((e) => ({
      staff_id: e.staff_id,
      staff: Array.isArray(e.staff) ? e.staff[0] : e.staff,
    })),
  }))
}

export async function fetchAllStaff(): Promise<Staff[]> {
  const { data, error } = await supabase
    .from('staff')
    .select('id,full_name,role,phone,active')
    .order('full_name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchAllContacts(): Promise<Contact[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select('id,group_name,name,role_title,phone_e164,has_whatsapp,sort,active')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchAllIncidents(): Promise<Incident[]> {
  const { data, error } = await supabase
    .from('incidents')
    .select('id,apartment_id,item_id,free_text,kind,qty,status,photo_paths,comment,created_by,created_at,resolved_by,resolved_at,resolution_note,writeoff_move_id')
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

// ---- Mutations (all through RPC) ----

export async function postMove(params: {
  op: string
  item: number
  qty: number
  apartment?: number | null
  staff?: number | null
  unitCost?: number | null
  note?: string | null
}): Promise<number> {
  const { data, error } = await supabase.rpc('post_move', {
    p_op: params.op,
    p_item: params.item,
    p_qty: params.qty,
    p_apartment: params.apartment ?? null,
    p_staff: params.staff ?? null,
    p_unit_cost: params.unitCost ?? null,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as number
}

export async function postDocument(params: {
  op: string
  lines: Array<{ item_id: number; qty: number; unit_cost?: number | null }>
  apartment?: number | null
  staff?: number | null
  supplier?: number | null
  note?: string | null
}): Promise<PostDocumentResult> {
  const { data, error } = await supabase.rpc('post_document', {
    p_op: params.op,
    p_lines: params.lines,
    p_apartment: params.apartment ?? null,
    p_staff: params.staff ?? null,
    p_supplier: params.supplier ?? null,
    p_note: params.note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as PostDocumentResult
}

export async function fetchSuppliers(): Promise<Supplier[]> {
  const { data, error } = await supabase
    .from('suppliers')
    .select('id,name,phone,note')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function fetchDocuments(docType?: string): Promise<DocumentWithSupplier[]> {
  let query = supabase
    .from('documents')
    .select('id,doc_type,number,doc_date,supplier_id,status,note,total_cost,created_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (docType && docType !== 'all') query = query.eq('doc_type', docType)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as DocumentRow[]
  const supplierIds = Array.from(new Set(rows.map((r) => r.supplier_id).filter((id): id is number => id !== null)))
  let supplierMap = new Map<number, string>()
  if (supplierIds.length) {
    const supRes = await supabase.from('suppliers').select('id,name').in('id', supplierIds)
    if (supRes.error) throw new Error(supRes.error.message)
    supplierMap = new Map((supRes.data ?? []).map((s: { id: number; name: string }) => [s.id, s.name]))
  }
  return rows.map((r) => ({ ...r, supplier_name: r.supplier_id ? supplierMap.get(r.supplier_id) ?? null : null }))
}

export async function fetchDocumentMoves(docId: string): Promise<Array<StockMoveRow & { item_name: string; item_base_unit: string; item_pack_size: number; item_pack_label: string }>> {
  const { data, error } = await supabase
    .from('stock_moves')
    .select('id,item_id,from_loc,to_loc,qty,unit_cost,source_type,source_id,apartment_id,staff_id,note,moved_at')
    .eq('doc_id', docId)
    .order('moved_at', { ascending: false })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as StockMoveRow[]
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)))
  const locationIds = Array.from(new Set(rows.flatMap((r) => [r.from_loc, r.to_loc])))
  const [itemsResult, locationsResult] = await Promise.all([
    itemIds.length ? supabase.from('items').select('id,name,base_unit,pack_size,pack_label').in('id', itemIds) : Promise.resolve({ data: [], error: null }),
    locationIds.length ? supabase.from('locations').select('id,name,type').in('id', locationIds) : Promise.resolve({ data: [], error: null }),
  ])
  if (itemsResult.error) throw new Error(itemsResult.error.message)
  if (locationsResult.error) throw new Error(locationsResult.error.message)
  const itemMap = new Map((itemsResult.data ?? []).map((i) => [i.id, i]))
  const locationMap = new Map((locationsResult.data ?? []).map((l) => [l.id, l]))
  return rows.map((r) => {
    const item = itemMap.get(r.item_id)
    return {
      ...r,
      from_location: locationMap.get(r.from_loc),
      to_location: locationMap.get(r.to_loc),
      item_name: item?.name ?? '?',
      item_base_unit: item?.base_unit ?? 'pcs',
      item_pack_size: item?.pack_size ?? 1,
      item_pack_label: item?.pack_label ?? '',
    }
  })
}

export async function fetchAttachments(docId: string): Promise<AttachmentRow[]> {
  const { data, error } = await supabase
    .from('attachments')
    .select('id,doc_id,incident_id,kind,storage_path,mime,created_at')
    .eq('doc_id', docId)
    .order('created_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function uploadAttachment(docId: string, file: File): Promise<AttachmentRow> {
  const timestamp = Date.now()
  const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
  const path = `${docId}/${timestamp}-${safeName}`
  const { error: uploadError } = await supabase.storage
    .from('receipts')
    .upload(path, file, { upsert: false })
  if (uploadError) throw new Error(uploadError.message)
  const { data, error } = await supabase
    .from('attachments')
    .insert({ doc_id: docId, kind: 'receipt', storage_path: path, mime: file.type })
    .select('id,doc_id,incident_id,kind,storage_path,mime,created_at')
    .single()
  if (error) throw new Error(error.message)
  return data as AttachmentRow
}

export async function createSignedUrl(path: string): Promise<string> {
  const { data, error } = await supabase.storage
    .from('receipts')
    .createSignedUrl(path, 3600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function deleteAttachment(id: string, storagePath: string): Promise<void> {
  const { error: storageError } = await supabase.storage.from('receipts').remove([storagePath])
  if (storageError) throw new Error(storageError.message)
  const { error } = await supabase.from('attachments').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

export async function issueMissing(apartmentId: number): Promise<IssueMissingResult> {
  const { data, error } = await supabase.rpc('issue_missing_to_apartment', {
    p_apartment: apartmentId,
  })
  if (error) throw new Error(error.message)
  return data as IssueMissingResult
}

export async function reverseCleaning(eventId: string, reason: string | null): Promise<unknown> {
  const { data, error } = await supabase.rpc('reverse_cleaning', {
    p_event: eventId,
    p_reason: reason,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function recalculateCleaning(
  eventId: string,
  cleanedAt: string | null,
  staffIds: number[] | null,
  leadStaffId: number | null,
): Promise<unknown> {
  const { data, error } = await supabase.rpc('recalculate_cleaning', {
    p_event: eventId,
    p_cleaned_at: cleanedAt,
    p_staff_ids: staffIds,
    p_lead_staff_id: leadStaffId,
  })
  if (error) throw new Error(error.message)
  return data
}

export async function approveIncident(
  incidentId: string,
  decision: 'confirm' | 'reject',
  note: string | null,
  force: boolean,
): Promise<unknown> {
  const { data, error } = await supabase.rpc('approve_incident', {
    p_incident: incidentId,
    p_decision: decision,
    p_note: note,
    p_force: force,
  })
  if (error) throw new Error(error.message)
  return data
}

// ---- Staff CRUD (admin_all policy) ----

export async function createStaff(name: string, role: string, phone: string): Promise<void> {
  const { error } = await supabase
    .from('staff')
    .insert({ full_name: name, role, phone: phone || null, active: true })
  if (error) throw new Error(error.message)
}

export async function updateStaff(id: number, patch: Partial<Pick<Staff, 'full_name' | 'role' | 'phone' | 'active'>>): Promise<void> {
  const { error } = await supabase.from('staff').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteStaff(id: number): Promise<void> {
  const { error } = await supabase.from('staff').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Contacts CRUD (admin_all policy) ----

export async function createContact(params: {
  name: string
  group_name: string | null
  role_title: string | null
  phone_e164: string
  has_whatsapp: boolean
  sort: number
}): Promise<void> {
  const { error } = await supabase.from('contacts').insert({ ...params, active: true })
  if (error) throw new Error(error.message)
}

export async function updateContact(id: number, patch: Partial<Contact>): Promise<void> {
  const { error } = await supabase.from('contacts').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteContact(id: number): Promise<void> {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Norm rules CRUD (admin_all policy) ----

export async function upsertNormRule(params: {
  id?: number
  norm_type: string
  apartment_id: number | null
  apt_type: string | null
  item_id: number
  qty: number
  note?: string | null
}): Promise<void> {
  const payload = {
    norm_type: params.norm_type,
    apartment_id: params.apartment_id,
    apt_type: params.apt_type,
    item_id: params.item_id,
    qty: params.qty,
    note: params.note ?? null,
  }
  if (params.id) {
    const { error } = await supabase.from('norm_rules').update(payload).eq('id', params.id)
    if (error) throw new Error(error.message)
  } else {
    const { error } = await supabase.from('norm_rules').insert(payload)
    if (error) throw new Error(error.message)
  }
}

export async function deleteNormRule(id: number): Promise<void> {
  const { error } = await supabase.from('norm_rules').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Categories CRUD (admin_all policy) ----

export async function fetchCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from('categories')
    .select('id,name,kind,sort')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createCategory(name: string, kind: ItemKind, sort: number): Promise<void> {
  const { error } = await supabase.from('categories').insert({ name, kind, sort })
  if (error) throw new Error(error.message)
}

export async function updateCategory(id: number, patch: Partial<Pick<Category, 'name' | 'kind' | 'sort'>>): Promise<void> {
  const { error } = await supabase.from('categories').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteCategory(id: number): Promise<void> {
  const { error } = await supabase.from('categories').delete().eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Items CRUD (admin_all policy) ----

export async function fetchItems(): Promise<Item[]> {
  const { data, error } = await supabase
    .from('items')
    .select('id,category_id,name,base_unit,pack_size,pack_label,min_stock,track_on_hand,qr_code,photo_path,active,sort,supplier_id')
    .order('sort')
    .order('name')
  if (error) throw new Error(error.message)
  return data ?? []
}

export async function createItem(params: {
  category_id: number
  name: string
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  min_stock: number | null
  track_on_hand: boolean
  supplier_id?: number | null
}): Promise<void> {
  const { error } = await supabase.from('items').insert({ ...params, active: true, sort: 0 })
  if (error) throw new Error(error.message)
}

export async function updateItem(id: number, patch: Partial<Pick<Item, 'name' | 'category_id' | 'base_unit' | 'pack_size' | 'pack_label' | 'min_stock' | 'track_on_hand' | 'active' | 'supplier_id' | 'qr_code'>>): Promise<void> {
  const { error } = await supabase.from('items').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteItem(id: number): Promise<void> {
  const { error } = await supabase.from('items').delete().eq('id', id)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
}

export async function itemHasHistory(itemId: number): Promise<boolean> {
  const [moves, norms] = await Promise.all([
    supabase.from('stock_moves').select('id', { head: true, count: 'exact' }).eq('item_id', itemId),
    supabase.from('norm_rules').select('id', { head: true, count: 'exact' }).eq('item_id', itemId),
  ])
  return (moves.count ?? 0) > 0 || (norms.count ?? 0) > 0
}

// ---- Inventory ----

export async function fetchOpenInventory(scope: InventoryScope, apartmentId?: number): Promise<InventoryRow | null> {
  let query = supabase
    .from('inventories')
    .select('id,scope,apartment_id,status,note,doc_id,created_by,created_at,closed_by,closed_at')
    .eq('scope', scope)
    .eq('status', 'open')
  if (scope === 'apartment') {
    query = query.eq('apartment_id', apartmentId ?? 0)
  } else {
    query = query.is('apartment_id', null)
  }
  const { data, error } = await query.maybeSingle()
  if (error) throw new Error(error.message)
  return data as InventoryRow | null
}

export async function startInventory(scope: InventoryScope, apartmentId?: number, note?: string): Promise<string> {
  const { data, error } = await supabase.rpc('inventory_start', {
    p_scope: scope,
    p_apartment: apartmentId ?? null,
    p_note: note ?? null,
  })
  if (error) throw new Error(error.message)
  return data as string
}

export async function fetchInventoryLines(inventoryId: string): Promise<InventoryLineRow[]> {
  const { data, error } = await supabase
    .from('inventory_lines')
    .select('id,inventory_id,item_id,expected,actual,decision,move_id')
    .eq('inventory_id', inventoryId)
    .order('item_id')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<Omit<InventoryLineRow, 'item_name' | 'base_unit' | 'pack_size' | 'pack_label'>>
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)))
  const itemMap = new Map<number, { name: string; base_unit: BaseUnit; pack_size: number; pack_label: string }>()
  if (itemIds.length) {
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id,name,base_unit,pack_size,pack_label')
      .in('id', itemIds)
    if (itemsError) throw new Error(itemsError.message)
    for (const i of items ?? []) {
      itemMap.set(i.id, { name: i.name, base_unit: i.base_unit, pack_size: i.pack_size, pack_label: i.pack_label })
    }
  }
  return rows.map((r) => {
    const item = itemMap.get(r.item_id)
    return {
      ...r,
      item_name: item?.name ?? '?',
      base_unit: item?.base_unit ?? 'pcs',
      pack_size: item?.pack_size ?? 1,
      pack_label: item?.pack_label ?? '',
    }
  })
}

export async function setInventoryActual(inventoryId: string, itemId: number, actual: number): Promise<void> {
  const { error } = await supabase.rpc('inventory_set_actual', {
    p_inventory: inventoryId,
    p_item: itemId,
    p_actual: actual,
  })
  if (error) throw new Error(error.message)
}

export async function closeInventory(inventoryId: string, rejectItems: number[]): Promise<InventoryCloseResult> {
  const { data, error } = await supabase.rpc('inventory_close', {
    p_inventory: inventoryId,
    p_reject_items: rejectItems,
  })
  if (error) throw new Error(error.message)
  return data as InventoryCloseResult
}

export async function cancelInventory(inventoryId: string): Promise<void> {
  const { error } = await supabase.rpc('inventory_cancel', {
    p_inventory: inventoryId,
  })
  if (error) throw new Error(error.message)
}

export async function fetchInventories(): Promise<InventoryWithApt[]> {
  const { data, error } = await supabase
    .from('inventories')
    .select('id,scope,apartment_id,status,note,doc_id,created_by,created_at,closed_by,closed_at')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as InventoryRow[]
  const aptIds = Array.from(new Set(rows.map((r) => r.apartment_id).filter((id): id is number => id !== null)))
  const docIds = Array.from(new Set(rows.map((r) => r.doc_id).filter((id): id is string => id !== null)))
  const [aptMap, docMap] = await Promise.all([
    aptIds.length ? supabase.from('apartments').select('id,code').in('id', aptIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
    docIds.length ? supabase.from('documents').select('id,number').in('id', docIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
  ])
  if (aptMap.error) throw new Error(aptMap.error.message)
  if (docMap.error) throw new Error(docMap.error.message)
  const aptCodeMap = new Map<number, string>((aptMap.data ?? []).map((a: { id: number; code: string }) => [a.id, a.code]))
  const docNumMap = new Map<string, string>((docMap.data ?? []).map((d: { id: string; number: string }) => [d.id, d.number]))
  return rows.map((r) => ({
    ...r,
    apartment_code: r.apartment_id ? aptCodeMap.get(r.apartment_id) ?? null : null,
    doc_number: r.doc_id ? docNumMap.get(r.doc_id) ?? null : null,
  }))
}

export async function fetchInventoryDetail(inventoryId: string): Promise<{ inventory: InventoryWithApt | null; lines: InventoryLineRow[] }> {
  const { data: invData, error: invError } = await supabase
    .from('inventories')
    .select('id,scope,apartment_id,status,note,doc_id,created_by,created_at,closed_by,closed_at')
    .eq('id', inventoryId)
    .maybeSingle()
  if (invError) throw new Error(invError.message)
  if (!invData) return { inventory: null, lines: [] }
  const inv = invData as InventoryRow
  let apartmentCode: string | null = null
  let docNumber: string | null = null
  if (inv.apartment_id) {
    const { data: apt } = await supabase.from('apartments').select('code').eq('id', inv.apartment_id).single()
    apartmentCode = apt?.code ?? null
  }
  if (inv.doc_id) {
    const { data: doc } = await supabase.from('documents').select('number').eq('id', inv.doc_id).single()
    docNumber = doc?.number ?? null
  }
  const lines = await fetchInventoryLines(inventoryId)
  return {
    inventory: { ...inv, apartment_code: apartmentCode, doc_number: docNumber },
    lines,
  }
}

// ---- Purchase Orders ----

export async function fetchPurchaseOrders(status?: POStatus): Promise<PurchaseOrderRow[]> {
  let query = supabase
    .from('purchase_orders_v')
    .select('id,number,status,supplier_id,supplier,note,created_at,sent_at,received_at,lines,total_qty,received_qty,est_cost')
    .order('created_at', { ascending: false })
    .limit(100)
  if (status) query = query.eq('status', status)
  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as PurchaseOrderRow[]
}

export async function fetchPurchaseOrder(id: string): Promise<PurchaseOrderRow | null> {
  const { data, error } = await supabase
    .from('purchase_orders_v')
    .select('id,number,status,supplier_id,supplier,note,created_at,sent_at,received_at,lines,total_qty,received_qty,est_cost')
    .eq('id', id)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as PurchaseOrderRow | null
}

export async function fetchPurchaseOrderLines(orderId: string): Promise<POLineRow[]> {
  const { data, error } = await supabase
    .from('purchase_order_lines')
    .select('id,order_id,item_id,qty,unit_cost,received_qty')
    .eq('order_id', orderId)
    .order('item_id')
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as Array<Omit<POLineRow, 'item_name' | 'base_unit' | 'pack_size' | 'pack_label'>>
  const itemIds = Array.from(new Set(rows.map((r) => r.item_id)))
  const itemMap = new Map<number, { name: string; base_unit: BaseUnit; pack_size: number; pack_label: string }>()
  if (itemIds.length) {
    const { data: items, error: itemsError } = await supabase
      .from('items')
      .select('id,name,base_unit,pack_size,pack_label')
      .in('id', itemIds)
    if (itemsError) throw new Error(itemsError.message)
    for (const i of items ?? []) {
      itemMap.set(i.id, { name: i.name, base_unit: i.base_unit, pack_size: i.pack_size, pack_label: i.pack_label })
    }
  }
  return rows.map((r) => {
    const item = itemMap.get(r.item_id)
    return {
      ...r,
      item_name: item?.name ?? '?',
      base_unit: item?.base_unit ?? 'pcs',
      pack_size: item?.pack_size ?? 1,
      pack_label: item?.pack_label ?? '',
    }
  })
}

export async function poGenerate(): Promise<POGenerateResult[]> {
  const { data, error } = await supabase.rpc('po_generate')
  if (error) throw new Error(error.message)
  return data as POGenerateResult[]
}

export async function poSetLine(orderId: string, itemId: number, qty: number, unitCost?: number | null): Promise<void> {
  const { error } = await supabase.rpc('po_set_line', {
    p_order: orderId,
    p_item: itemId,
    p_qty: qty,
    p_unit_cost: unitCost ?? null,
  })
  if (error) throw new Error(error.message)
}

export async function poSetStatus(orderId: string, status: 'sent' | 'cancelled'): Promise<void> {
  const { error } = await supabase.rpc('po_set_status', {
    p_order: orderId,
    p_status: status,
  })
  if (error) throw new Error(error.message)
}

export async function poReceive(orderId: string, lines?: Array<{ item_id: number; qty: number; unit_cost?: number | null }> | null): Promise<POReceiveResult> {
  const { data, error } = await supabase.rpc('po_receive', {
    p_order: orderId,
    p_lines: lines ?? null,
  })
  if (error) throw new Error(error.message)
  return data as POReceiveResult
}

// ---- Suppliers CRUD (admin_all policy) ----

export async function createSupplier(name: string, phone: string | null, note: string | null): Promise<Supplier> {
  const { data, error } = await supabase
    .from('suppliers')
    .insert({ name, phone: phone || null, note: note || null })
    .select('id,name,phone,note')
    .single()
  if (error) throw new Error(error.message)
  return data as Supplier
}

export async function updateSupplier(id: number, patch: Partial<Pick<Supplier, 'name' | 'phone' | 'note'>>): Promise<void> {
  const { error } = await supabase.from('suppliers').update(patch).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function deleteSupplier(id: number): Promise<void> {
  const { error } = await supabase.from('suppliers').delete().eq('id', id)
  if (error) throw Object.assign(new Error(error.message), { code: error.code })
}

// ---- Settings CRUD (admin_all policy) ----

export interface SettingRow {
  key: string
  value: string
}

export async function fetchSettings(): Promise<SettingRow[]> {
  const { data, error } = await supabase.from('settings').select('key,value').order('key')
  if (error) throw new Error(error.message)
  return (data ?? []).map((r: { key: string; value: unknown }) => ({
    key: r.key,
    value: typeof r.value === 'string' ? r.value : JSON.stringify(r.value),
  }))
}

export async function updateSetting(key: string, value: string): Promise<void> {
  const { error } = await supabase.from('settings').update({ value }).eq('key', key)
  if (error) throw new Error(error.message)
}

// ---- Incident photos (signed URLs) ----

export async function createIncidentPhotoUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('incident-photos')
    .createSignedUrl(path, 3600)
  if (error) return null
  return data?.signedUrl ?? null
}

export async function fetchSentOrdersCount(): Promise<number> {
  const { count, error } = await supabase
    .from('purchase_orders_v')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'sent')
  if (error) throw new Error(error.message)
  return count ?? 0
}

// ---- Reports (read-only) ----

export interface ReportMoveRow {
  id: number
  item_id: number
  item_name: string
  base_unit: BaseUnit
  pack_size: number
  pack_label: string
  qty: number
  unit_cost: number | null
  source_type: string
  source_id: string | null
  apartment_id: number | null
  staff_id: number | null
  note: string | null
  moved_at: string
  from_loc: number
  to_loc: number
  from_location?: { name: string; type: string } | null
  to_location?: { name: string; type: string } | null
  author?: string | null
  apartment_code?: string | null
}

async function fetchAllMovesPaginated(
  filters: Record<string, unknown>,
): Promise<ReportMoveRow[]> {
  const allRows: ReportMoveRow[] = []
  let offset = 0
  const pageSize = 1000
  // eslint-disable-next-line no-constant-condition
  while (true) {
    let query = supabase
      .from('stock_moves')
      .select('id,item_id,from_loc,to_loc,qty,unit_cost,source_type,source_id,apartment_id,staff_id,note,moved_at,created_by')
      .order('moved_at', { ascending: false })
      .range(offset, offset + pageSize - 1)
    for (const [key, value] of Object.entries(filters)) {
      if (value === null || value === undefined || value === '') continue
      if (key === 'moved_at_gte') query = query.gte('moved_at', value as string)
      else if (key === 'moved_at_lt') query = query.lt('moved_at', value as string)
      else query = query.eq(key, value as string)
    }
    const { data, error } = await query
    if (error) throw new Error(error.message)
    const rows = (data ?? []) as Array<ReportMoveRow & { created_by: string | null }>
    if (rows.length === 0) break
    allRows.push(...rows)
    if (rows.length < pageSize) break
    offset += pageSize
  }
  // Enrich with item, location, apartment, profile data
  const itemIds = Array.from(new Set(allRows.map((r) => r.item_id)))
  const locationIds = Array.from(new Set(allRows.flatMap((r) => [r.from_loc, r.to_loc])))
  const aptIds = Array.from(new Set(allRows.map((r) => r.apartment_id).filter((id): id is number => id !== null)))
  const authorIds = Array.from(new Set(allRows.map((r) => (r as ReportMoveRow & { created_by: string | null }).created_by).filter((id): id is string => id !== null)))
  const [itemsRes, locsRes, aptsRes, profilesRes] = await Promise.all([
    itemIds.length ? supabase.from('items').select('id,name,base_unit,pack_size,pack_label').in('id', itemIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
    locationIds.length ? supabase.from('locations').select('id,name,type').in('id', locationIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
    aptIds.length ? supabase.from('apartments').select('id,code').in('id', aptIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
    authorIds.length ? supabase.from('profiles').select('id,full_name,login').in('id', authorIds) : Promise.resolve({ data: [], error: null as null | { message: string } }),
  ])
  if (itemsRes.error) throw new Error(itemsRes.error.message)
  if (locsRes.error) throw new Error(locsRes.error.message)
  if (aptsRes.error) throw new Error(aptsRes.error.message)
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  const itemMap = new Map((itemsRes.data ?? []).map((i) => [i.id, i]))
  const locMap = new Map((locsRes.data ?? []).map((l) => [l.id, l]))
  const aptMap = new Map((aptsRes.data ?? []).map((a: { id: number; code: string }) => [a.id, a.code]))
  const profileMap = new Map((profilesRes.data ?? []).map((p) => [p.id, p.full_name || p.login]))
  return allRows.map((r) => {
    const item = itemMap.get(r.item_id)
    const { created_by, ...rest } = r as ReportMoveRow & { created_by: string | null }
    return {
      ...rest,
      item_name: item?.name ?? '?',
      base_unit: (item?.base_unit ?? 'pcs') as BaseUnit,
      pack_size: item?.pack_size ?? 1,
      pack_label: item?.pack_label ?? '',
      from_location: locMap.get(r.from_loc) ?? null,
      to_location: locMap.get(r.to_loc) ?? null,
      author: created_by ? profileMap.get(created_by) ?? null : null,
      apartment_code: r.apartment_id ? aptMap.get(r.apartment_id) ?? null : null,
    }
  })
}

export async function fetchCleaningReport(from: string, to: string): Promise<ReportMoveRow[]> {
  const [cleaning, reversals] = await Promise.all([
    fetchAllMovesPaginated({ source_type: 'cleaning', moved_at_gte: from, moved_at_lt: to }),
    fetchAllMovesPaginated({ source_type: 'cleaning_reversal', moved_at_gte: from, moved_at_lt: to }),
  ])
  const reversalIds = new Set(reversals.map((r) => r.id))
  const cleaningFiltered = cleaning.filter((r) => !reversalIds.has(r.id))
  return [...cleaningFiltered, ...reversals]
}

export async function fetchMovesReport(params: {
  from: string
  to: string
  itemId?: number | null
  apartmentId?: number | null
  sourceType?: string | null
}): Promise<ReportMoveRow[]> {
  const filters: Record<string, unknown> = {
    moved_at_gte: params.from,
    moved_at_lt: params.to,
  }
  if (params.itemId) filters.item_id = params.itemId
  if (params.apartmentId) filters.apartment_id = params.apartmentId
  if (params.sourceType) filters.source_type = params.sourceType
  return fetchAllMovesPaginated(filters)
}
