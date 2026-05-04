import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage)
  },
  {
    path: 'log-investigation',
    loadComponent: () => import('./log-investigation/log-investigation.page').then((m) => m.LogInvestigationPage)
  },
  {
    path: 'investigation-history',
    loadComponent: () =>
      import('./investigation-history/investigation-history.page').then((m) => m.InvestigationHistoryPage)
  },
  {
    path: 'investigation/:id',
    loadComponent: () =>
      import('./investigation-detail/investigation-detail.page').then((m) => m.InvestigationDetailPage)
  },
  {
    path: 'investigation/:id/edit',
    loadComponent: () =>
      import('./investigation-edit/investigation-edit.page').then((m) => m.InvestigationEditPage)
  },
  {
    path: 'emf',
    loadComponent: () => import('./emf/emf.page').then((m) => m.EmfPage)
  },
  {
    path: 'vibrations',
    loadComponent: () => import('./vibrations/vibrations.page').then((m) => m.VibrationsPage)
  },
  {
    path: 'field-note',
    loadComponent: () => import('./field-note/field-note.page').then((m) => m.FieldNotePage)
  },
  {
    path: 'evp',
    loadComponent: () => import('./evp/evp.page').then((m) => m.EvpPage)
  },
  {
    path: 'photograph',
    loadComponent: () => import('./photograph/photograph.page').then((m) => m.PhotographPage)
  },
  {
    path: 'video',
    loadComponent: () => import('./video/video.page').then((m) => m.VideoPage)
  },
  {
    path: 'about',
    loadComponent: () => import('./about/about.page').then((m) => m.AboutPage)
  }
];
