import ConfirmClient from './ConfirmClient';

export const metadata = { title: 'Activate Account — Reefer Planner' };

export default async function ConfirmPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  return <ConfirmClient token={token} />;
}
