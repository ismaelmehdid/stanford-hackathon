import { type ReactNode, useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Shell } from '@/components/shell';
import NotFound from '@/pages/not-found';
import Dashboard from '@/pages/dashboard';
import Analytics from '@/pages/analytics';
import Campaigns from '@/pages/campaigns';
import CampaignDetail from '@/pages/campaign-detail';
import Pipelines from '@/pages/pipelines';
import Approvals from '@/pages/approvals';
import { Route, Switch, useLocation, Router as WouterRouter } from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15000, refetchOnWindowFocus: true } },
});

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  useEffect(() => {
    const label = location === '/' ? 'Dashboard' : location.startsWith('/campaigns/') ? 'Campaign repository' : location.slice(1).replace(/^./, s => s.toUpperCase());
    document.title = `${label} · GrowthOS`;
    const descriptions: Record<string, string> = {
      '/': 'GrowthOS leadership dashboard: planned marketing budgets, review priorities, and campaign funding gaps.',
      '/analytics': 'Analyze planned channel budgets and workflow activity, and save balanced allocation drafts without changing ad accounts.',
      '/campaigns': 'Browse, search, and reuse versioned GrowthOS marketing campaign repositories.',
      '/pipelines': 'Track marketing campaigns from draft through review, approval, and internally marked live.',
      '/approvals': 'Review campaign briefs, record decisions, and request changes in GrowthOS.',
    };
    const description = descriptions[location] ?? 'Edit a campaign brief and inspect its revision history, approvals, and reusable content.';
    const meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const og = document.querySelector<HTMLMetaElement>('meta[property="og:description"]');
    const title = document.querySelector<HTMLMetaElement>('meta[property="og:title"]');
    if (meta) meta.content = description;
    if (og) og.content = description;
    if (title) title.content = document.title;
  }, [location]);
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Shell>
          <RoutedErrorBoundary>
            <Switch>
              <Route path="/" component={Dashboard} />
              <Route path="/analytics" component={Analytics} />
              <Route path="/campaigns" component={Campaigns} />
              <Route path="/campaigns/:id" component={CampaignDetail} />
              <Route path="/pipelines" component={Pipelines} />
              <Route path="/approvals" component={Approvals} />
              <Route component={NotFound} />
            </Switch>
          </RoutedErrorBoundary>
        </Shell>
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
