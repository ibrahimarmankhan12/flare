import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "ui/card";

const convertErrorToMessage = (error: string) => {
  switch (error) {
    case "signup_disabled":
      return "Signup is disabled";
    case "UNAUTHORIZED":
      return "Authentication required";
    default:
      return error;
  }
};

export default async function ErrorPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <div className="w-full h-screen flex items-center justify-center relative">
      <Card className="w-sm z-10">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">Auth Error</CardTitle>
          <CardDescription>
            {convertErrorToMessage(error ?? "Unknown error")}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex justify-center">
          <Link
            className="text-sm text-muted-foreground text-center underline"
            href="/"
          >
            Go to home
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
