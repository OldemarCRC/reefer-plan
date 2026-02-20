import { redirect } from 'next/navigation';

// Contracts are managed through the Admin page — redirect any direct access
export default function ContractsPage() {
  redirect('/admin');
}
