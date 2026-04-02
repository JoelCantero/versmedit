type PageHeaderProps = {
  title: string
  description: string
}

export default function PageHeader({ title, description }: PageHeaderProps) {
  return (
    <div className="mx-auto max-w-2xl text-center">
      <h1 className="text-4xl font-semibold tracking-tight text-balance text-foreground sm:text-5xl">{title}</h1>
      <p className="mt-2 text-lg/8 text-muted-foreground">{description}</p>
    </div>
  )
}
