import { redirect } from 'next/navigation'

export default function Home() {
  // Redirect to admin login page
  redirect('/admin/login')
}