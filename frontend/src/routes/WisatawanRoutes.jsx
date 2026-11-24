import { Route } from 'react-router-dom';
import ProtectedRoute from '../components/common/ProtectedRoute';
import WisatawanLayout from '../layouts/WisatawanLayout';
import Home from '../pages/wisatawan/Home';
import Explore from '../pages/wisatawan/Explore';
import Recommendations from '../pages/wisatawan/Recommendations';
import DestinationDetail from '../pages/wisatawan/DestinationDetail';
import ChooseDestination from '../pages/wisatawan/ChooseDestination';
import WriteReview from '../pages/wisatawan/WriteReview';
import Profile from '../pages/wisatawan/Profile';
import PublicProfile from '../pages/wisatawan/PublicProfile';
import Login from '../pages/auth/Login';
import Register from '../pages/auth/Register';

// Situs publik + fitur wisatawan. Dipasang langsung di dalam <Routes> pada App.jsx.
const WisatawanRoutes = (
  <>
    <Route element={<WisatawanLayout />}>
      <Route path="/" element={<Home />} />
      <Route path="/jelajah" element={<Explore />} />
      <Route path="/rekomendasi" element={<Recommendations />} />
      <Route path="/destinasi/:id" element={<DestinationDetail />} />

      <Route
        path="/tulis-review"
        element={
          <ProtectedRoute>
            <ChooseDestination />
          </ProtectedRoute>
        }
      />
      <Route
        path="/destinasi/:id/tulis-review"
        element={
          <ProtectedRoute>
            <WriteReview />
          </ProtectedRoute>
        }
      />

      <Route
        path="/profil"
        element={
          <ProtectedRoute>
            <Profile />
          </ProtectedRoute>
        }
      />
      <Route path="/pengguna/:username" element={<PublicProfile />} />
    </Route>

    {/* Halaman auth: tanpa layout situs */}
    <Route path="/login" element={<Login />} />
    <Route path="/register" element={<Register />} />
  </>
);

export default WisatawanRoutes;
