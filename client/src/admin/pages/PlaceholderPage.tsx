type Props = { title: string };

export function PlaceholderPage({ title }: Props) {
  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold text-white">{title}</h1>
      <p className="mt-2 text-gray-400">Page content will be built here.</p>
    </div>
  );
}
