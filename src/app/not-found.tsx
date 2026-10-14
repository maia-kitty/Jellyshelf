import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mt-24 text-center">
      <h1 className="text-2xl font-bold">Not found</h1>
      <Link href="/" className="mt-4 inline-block text-accent hover:underline">
        Back to discover
      </Link>
    </div>
  );
}
