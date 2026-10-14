import { lazy, Suspense, useState, useEffect } from 'react'
import { Routes, Route, Navigate, useParams } from 'react-router-dom'
import { SvLayout } from '@/modules/core/SvLayout'
import { useAuth } from '@/modules/core/store'
import { useI18n } from '@/i18n'
import { Shield } from 'lucide-react'
import { AdminLayout } from '@/modules/admin/AdminLayout'
import { MoveModal } from '@/modules/admin/MoveForm'

const ApartmentList = lazy(() => import('@/modules/apartments/ApartmentList').then(m => ({ default: m.ApartmentList })))
const ApartmentDetail = lazy(() => import('@/modules/apartments/ApartmentDetail').then(m => ({ default: m.ApartmentDetail })))
const CleaningSheet = lazy(() => import('@/modules/cleaning/CleaningSheet').then(m => ({ default: m.CleaningSheet })))
const IncidentList = lazy(() => import('@/modules/incidents/IncidentList').then(m => ({ default: m.IncidentList })))
const IncidentForm = lazy(() => import('@/modules/incidents/IncidentForm').then(m => ({ default: m.IncidentForm })))
const ContactsPage = lazy(() => import('@/modules/contacts/ContactsPage').then(m => ({ default: m.ContactsPage })))
const ProfilePage = lazy(() => import('@/modules/core/ProfilePage').then(m => ({ default: m.ProfilePage })))

const Dashboard = lazy(() => import('@/modules/admin/Dashboard').then(m => ({ default: m.Dashboard })))
const WarehousePage = lazy(() => import('@/modules/admin/WarehousePage').then(m => ({ default: m.WarehousePage })))
const AdminApartmentList = lazy(() => import('@/modules/admin/AdminApartmentList').then(m => ({ default: m.AdminApartmentList })))
const AdminApartmentDetail = lazy(() => import('@/modules/admin/AdminApartmentDetail').then(m => ({ default: m.AdminApartmentDetail })))
const AdminMore = lazy(() => import('@/modules/admin/AdminMore').then(m => ({ default: m.AdminMore })))
const StaffPage = lazy(() => import('@/modules/admin/StaffPage').then(m => ({ default: m.StaffPage })))
const UsersPage = lazy(() => import('@/modules/admin/UsersPage').then(m => ({ default: m.UsersPage })))
const AdminIncidents = lazy(() => import('@/modules/admin/AdminIncidents').then(m => ({ default: m.AdminIncidents })))
const AdminContacts = lazy(() => import('@/modules/admin/AdminContacts').then(m => ({ default: m.AdminContacts })))
const NormTemplatesPage = lazy(() => import('@/modules/admin/NormTemplatesPage').then(m => ({ default: m.NormTemplatesPage })))
const CatalogPage = lazy(() => import('@/modules/admin/CatalogPage').then(m => ({ default: m.CatalogPage })))
const DocumentsPage = lazy(() => import('@/modules/admin/DocumentsPage').then(m => ({ default: m.DocumentsPage })))
const DocumentDetailPage = lazy(() => import('@/modules/admin/DocumentDetailPage').then(m => ({ default: m.DocumentDetailPage })))
const InventoryScreen = lazy(() => import('@/modules/admin/InventoryScreen').then(m => ({ default: m.InventoryScreen })))
const InventoriesPage = lazy(() => import('@/modules/admin/InventoriesPage').then(m => ({ default: m.InventoriesPage })))
const OrdersPage = lazy(() => import('@/modules/admin/OrdersPage').then(m => ({ default: m.OrdersPage })))
const OrderDetailPage = lazy(() => import('@/modules/admin/OrderDetailPage').then(m => ({ default: m.OrderDetailPage })))
const SuppliersPage = lazy(() => import('@/modules/admin/SuppliersPage').then(m => ({ default: m.SuppliersPage })))
const SettingsPage = lazy(() => import('@/modules/admin/SettingsPage').then(m => ({ default: m.SettingsPage })))
const QRLabelsPage = lazy(() => import('@/modules/admin/QRLabelsPage').then(m => ({ default: m.QRLabelsPage })))
const ReportsPage = lazy(() => import('@/modules/admin/ReportsPage').then(m => ({ default: m.ReportsPage })))

function ApartmentInventoryRoute() {
  const { id } = useParams<{ id: string }>()
  const aptId = Number(id)
  const [apartmentCode, setApartmentCode] = useState<string | undefined>(undefined)
  useEffect(() => {
    if (!aptId) return
    import('@/modules/admin/api').then(({ fetchApartmentsAdmin }) => {
      fetchApartmentsAdmin().then((apts) => {
        const apt = apts.find((a) => a.id === aptId)
        if (apt) setApartmentCode(apt.code)
      })
    })
  }, [aptId])
  return <InventoryScreen scope="apartment" apartmentId={aptId} apartmentCode={apartmentCode} />
}

function Loading() {
  const { t } = useI18n()
  return <div className="px-4 pt-8 text-center text-muted">{t.app.loading}</div>
}

function AdminBanner() {
  const { t } = useI18n()
  return (
    <div className="sticky top-0 z-40 bg-warn-soft text-warn text-center text-sm py-2 font-medium flex items-center justify-center gap-2">
      <Shield className="w-4 h-4" />
      {t.adminBanner}
    </div>
  )
}

function MoveRoute() {
  const [show, setShow] = useState(true)
  return (
    <>
      {show && (
        <MoveModal
          onClose={() => { setShow(false); window.history.back() }}
          onDone={() => { setShow(false); window.history.back() }}
        />
      )}
    </>
  )
}

export function AdminRoutes() {
  return (
    <AdminLayout>
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<Dashboard />} />
          <Route path="stock" element={<WarehousePage />} />
          <Route path="move" element={<MoveRoute />} />
          <Route path="apartments" element={<AdminApartmentList />} />
          <Route path="apartments/:id" element={<AdminApartmentDetail />} />
          <Route path="more" element={<AdminMore />} />
          <Route path="more/staff" element={<StaffPage />} />
          <Route path="more/users" element={<UsersPage />} />
          <Route path="more/incidents" element={<AdminIncidents />} />
          <Route path="more/contacts" element={<AdminContacts />} />
          <Route path="more/norm-templates" element={<NormTemplatesPage />} />
          <Route path="more/catalog" element={<CatalogPage />} />
          <Route path="more/documents" element={<DocumentsPage />} />
          <Route path="more/documents/:id" element={<DocumentDetailPage />} />
          <Route path="more/inventories" element={<InventoriesPage />} />
          <Route path="more/orders" element={<OrdersPage />} />
          <Route path="more/orders/:id" element={<OrderDetailPage />} />
          <Route path="more/suppliers" element={<SuppliersPage />} />
          <Route path="more/settings" element={<SettingsPage />} />
          <Route path="more/qr-labels" element={<QRLabelsPage />} />
          <Route path="more/reports" element={<ReportsPage />} />
          <Route path="stock/inventory" element={<InventoryScreen scope="warehouse" />} />
          <Route path="apartments/:id/inventory" element={<ApartmentInventoryRoute />} />
          <Route path="*" element={<Navigate to="/admin" replace />} />
        </Routes>
      </Suspense>
    </AdminLayout>
  )
}

export function SvRoutes() {
  const profile = useAuth((s) => s.profile)
  const isAdmin = profile?.role === 'admin'

  return (
    <SvLayout>
      {isAdmin && <AdminBanner />}
      <Suspense fallback={<Loading />}>
        <Routes>
          <Route index element={<ApartmentList />} />
          <Route path="apartments/:id" element={<ApartmentDetail />} />
          <Route path="apartments/:id/clean" element={<><ApartmentDetail /><CleaningSheet /></>} />
          <Route path="incidents" element={<IncidentList />} />
          <Route path="incidents/new" element={<IncidentForm />} />
          <Route path="contacts" element={<ContactsPage />} />
          <Route path="profile" element={<ProfilePage />} />
          <Route path="*" element={<Navigate to="/sv" replace />} />
        </Routes>
      </Suspense>
    </SvLayout>
  )
}
