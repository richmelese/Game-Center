import { BrowserRouter, HashRouter, Route, Routes } from 'react-router-dom';
import { IS_WEB } from '@/lib/config';
import { AuthProvider } from '@/lib/auth';
import AdminLoginPage from '@/pages/admin/AdminLoginPage';
import AdminPage from '@/pages/admin/AdminPage';
import GamePage from '@/pages/GamePage';
import HomePage from '@/pages/HomePage';
import LoginPage from '@/pages/LoginPage';
import MyGamesPage from '@/pages/MyGamesPage';
import PaymentResultPage from '@/pages/PaymentResultPage';
import PlayPage from '@/pages/PlayPage';
import SupportPage from '@/pages/SupportPage';
import WalletPage from '@/pages/WalletPage';

// The SuperApp loads index.html from a local package, where path-based routing can't work.
const Router = IS_WEB ? BrowserRouter : HashRouter;

export default function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/my-games" element={<MyGamesPage />} />
          <Route path="/wallet" element={<WalletPage />} />
          <Route path="/support" element={<SupportPage />} />
          <Route path="/games/:slug" element={<GamePage />} />
          <Route path="/play/:slug" element={<PlayPage />} />
          <Route path="/payment/result" element={<PaymentResultPage />} />
          <Route path="/admin" element={<AdminPage />} />
          <Route path="/admin/login" element={<AdminLoginPage />} />
          <Route path="*" element={<HomePage />} />
        </Routes>
      </Router>
    </AuthProvider>
  );
}
