import { LoginForm } from "./LoginForm";

type LoginSearchParams = Promise<{
  redirectedFrom?: string;
}>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: LoginSearchParams;
}) {
  const { redirectedFrom } = await searchParams;

  return <LoginForm redirectedFrom={redirectedFrom} />;
}
