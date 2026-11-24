import AccountSettings from '../../components/common/AccountSettings';

// /pengelola/akun: pengaturan akun pengelola (portal mitra tidak memakai halaman /profil situs)
export default function ManageAccount() {
  return <AccountSettings desc="Kelola nama, email, dan kata sandi akun pengelola Anda." />;
}
