import { Switch, Route, Router as WouterRouter, Redirect } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Layout from "@/components/Layout";
import Dashboard from "@/pages/Dashboard";
import Campaigns from "@/pages/Campaigns";
import CampaignNew from "@/pages/CampaignNew";
import CampaignDetail from "@/pages/CampaignDetail";
import Contacts from "@/pages/Contacts";
import ContactDetail from "@/pages/ContactDetail";
import Groups from "@/pages/Groups";
import Templates from "@/pages/Templates";
import Inbox from "@/pages/Inbox";
import NotFound from "@/pages/not-found";
import Settings from "@/pages/Settings";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
  },
});

function Router() {
  return (
    <Layout>
      <Switch>
        <Route path="/">
          <Redirect to="/dashboard" />
        </Route>
        <Route path="/dashboard" component={Dashboard} />
        <Route path="/campaigns/new" component={CampaignNew} />
        <Route path="/campaigns/:id" component={CampaignDetail} />
        <Route path="/campaigns" component={Campaigns} />
        <Route path="/contacts/:id" component={ContactDetail} />
        <Route path="/contacts" component={Contacts} />
        <Route path="/groups" component={Groups} />
        <Route path="/templates" component={Templates} />
        <Route path="/inbox" component={Inbox} />
        <Route path="/settings" component={Settings} />
        <Route component={NotFound} />
      </Switch>
    </Layout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
