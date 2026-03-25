import { useParams, Link } from 'react-router-dom';
import { CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';

export default function FormSuccessPage() {
  const { slug } = useParams();
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="text-center space-y-6 max-w-md">
        <CheckCircle2 className="h-16 w-16 text-green-500 mx-auto" />
        <h1 className="text-3xl font-bold">Bedankt!</h1>
        <p className="text-lg text-muted-foreground">Je End of Day evaluatie is opgeslagen.</p>
        <Button asChild variant="outline">
          <Link to={`/form/${slug}`}>Nog een keer invullen</Link>
        </Button>
      </div>
    </div>
  );
}
