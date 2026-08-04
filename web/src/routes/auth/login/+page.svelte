<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import AnimatedHeight from '$lib/components/layouts/AnimatedHeight.svelte';
  import AuthPageLayout from '$lib/components/layouts/AuthPageLayout.svelte';
  import { eventManager } from '$lib/managers/event-manager.svelte';
  import { serverConfigManager } from '$lib/managers/server-config-manager.svelte';
  import { Route } from '$lib/route';
  import { oauth } from '$lib/utils';
  import { getServerErrorMessage, handleError } from '$lib/utils/handle-error';
  import { isHttpError, login, signUp, type LoginResponseDto } from '@immich/sdk';
  import { Alert, Button, Field, Input, PasswordInput, Stack, Text } from '@immich/ui';
  import { onMount } from 'svelte';
  import { t } from 'svelte-i18n';
  import type { PageData } from './$types';

  interface Props {
    data: PageData;
  }

  let { data }: Props = $props();

  let errorMessage: string = $state('');
  let email = $state('');
  let password = $state('');
  let name = $state('');
  let confirmPassword = $state('');
  let oauthError = $state('');
  let loading = $state(false);
  let oauthLoading = $state(true);

  // The pending screen is transient post-login state that cannot be reconstructed from a URL,
  // so it stays in component state. Only the email is persisted, so that a reload can prefill
  // the sign-in form — the password is deliberately never stored.
  const PENDING_EMAIL_KEY = 'immich.pendingApprovalEmail';
  let pendingApproval = $state(false);

  const serverConfig = $derived(serverConfigManager.value);
  const publicConfig = $derived(data.publicConfig);
  const signUpEnabled = $derived(publicConfig.signUp.enabled && publicConfig.passwordLogin.enabled);

  // Derived from the URL so refresh, the back button, and a shareable ?mode=create link all work.
  const isCreating = $derived(signUpEnabled && page.url.searchParams.get('mode') === 'create');

  const onSuccess = async (user: LoginResponseDto) => {
    await goto(data.continueUrl, { invalidateAll: true });
    eventManager.emit('AuthLogin', user);
  };

  const onFirstLogin = () => goto(Route.changePassword());
  const onOnboarding = () => goto(Route.onboarding());

  onMount(async () => {
    if (!publicConfig.oauth.enabled) {
      oauthLoading = false;
      return;
    }
    if (oauth.isCallback(location)) {
      try {
        const user = await oauth.login(location);
        if (!user.isOnboarded) {
          await onOnboarding();
          return;
        }
        await onSuccess(user);
        return;
      } catch (error) {
        console.error('Error [login-form] [oauth.callback]', error);
        oauthError = getServerErrorMessage(error) || $t('errors.unable_to_complete_oauth_login');
        oauthLoading = false;
        return;
      }
    }
    try {
      if (
        (publicConfig.oauth.autoLaunch && !oauth.isAutoLaunchDisabled(location)) ||
        oauth.isAutoLaunchEnabled(location)
      ) {
        await goto(Route.login({ autoLaunch: 0 }), { replaceState: true });
        await oauth.authorize(location);
        return;
      }
    } catch (error) {
      handleError(error, $t('errors.unable_to_connect'));
    }
    oauthLoading = false;
  });

  // `getServerErrorMessage` only returns `message`, so read the discriminator off the body
  // directly. `handleError` must stay out of this path — it truncates and decorates the text.
  const isPendingApprovalError = (error: unknown) => isHttpError(error) && error.data?.code === 'pending_approval';

  const showPendingApproval = () => {
    pendingApproval = true;
    errorMessage = '';
    localStorage.setItem(PENDING_EMAIL_KEY, email);
  };

  const useDifferentAccount = async () => {
    pendingApproval = false;
    localStorage.removeItem(PENDING_EMAIL_KEY);
    email = '';
    password = '';
    await switchMode('signin');
  };

  const switchMode = async (mode: 'signin' | 'create') => {
    errorMessage = '';
    password = '';
    confirmPassword = '';

    await goto(mode === 'create' ? Route.login({ mode: 'create' }) : Route.login(), {
      replaceState: true,
      noScroll: true,
      keepFocus: true,
    });
  };

  const handleLogin = async () => {
    try {
      errorMessage = '';
      loading = true;
      const user = await login({ loginCredentialDto: { email, password } });

      localStorage.removeItem(PENDING_EMAIL_KEY);

      if (user.isAdmin && !serverConfig.isOnboarded) {
        await onOnboarding();
        return;
      }
      // change the user password before we onboard them
      if (!user.isAdmin && user.shouldChangePassword) {
        await onFirstLogin();
        return;
      }
      // We want to onboard after the first login since their password will change
      // and handleLogin will be called again (relogin). We then do onboarding on that next call.
      if (!user.isOnboarded) {
        await onOnboarding();
        return;
      }
      await onSuccess(user);
      return;
    } catch (error) {
      // Correct credentials on an unapproved account: show the waiting screen, not an error.
      if (isPendingApprovalError(error)) {
        showPendingApproval();
        loading = false;
        return;
      }
      errorMessage = getServerErrorMessage(error) || $t('errors.incorrect_email_or_password');
      loading = false;
      return;
    }
  };

  const handleSignUp = async () => {
    if (password !== confirmPassword) {
      errorMessage = $t('password_does_not_match');
      return;
    }

    try {
      errorMessage = '';
      loading = true;
      await signUp({ signUpDto: { email, password, name } });
      showPendingApproval();
    } catch (error) {
      errorMessage = getServerErrorMessage(error) || $t('errors.unable_to_sign_up');
    } finally {
      loading = false;
    }
  };

  const checkApprovalStatus = async () => {
    // After a reload the in-memory password is gone; fall back to the prefilled sign-in form
    // rather than leaving a button that silently does nothing.
    if (!password) {
      pendingApproval = false;
      email = localStorage.getItem(PENDING_EMAIL_KEY) ?? email;
      errorMessage = '';
      await switchMode('signin');
      return;
    }

    await handleLogin();
  };

  const handleOAuthLogin = async () => {
    oauthLoading = true;
    oauthError = '';
    const success = await oauth.authorize(location);
    if (!success) {
      oauthLoading = false;
      oauthError = $t('errors.unable_to_login_with_oauth');
    }
  };

  const onsubmit = async (event: Event) => {
    event.preventDefault();
    await (isCreating ? handleSignUp() : handleLogin());
  };
</script>

<AuthPageLayout title={pendingApproval ? $t('account_pending_approval') : isCreating ? $t('sign_up') : data.meta.title}>
  <AnimatedHeight>
    <Stack gap={4}>
      {#if pendingApproval}
        <Alert color="warning" title={$t('account_pending_approval')}>
          <Text>{$t('account_pending_approval_description')}</Text>
        </Alert>

        <Button size="large" shape="round" fullWidth {loading} onclick={checkApprovalStatus}>
          {$t('check_approval_status')}
        </Button>
        <Button size="large" shape="round" fullWidth color="secondary" variant="ghost" onclick={useDifferentAccount}>
          {$t('use_different_account')}
        </Button>
      {:else}
        {#if publicConfig.server.loginPageMessage}
          <Alert color="primary" class="mb-6">
            <!-- eslint-disable-next-line svelte/no-at-html-tags -->
            {@html publicConfig.server.loginPageMessage}
          </Alert>
        {/if}

        {#if !oauthLoading && publicConfig.passwordLogin.enabled}
          <form {onsubmit} class="flex flex-col gap-4">
            <div aria-live="polite" class="contents">
              {#if errorMessage}
                <Alert color="danger" title={errorMessage} closable />
              {/if}
            </div>

            {#if isCreating}
              <Field label={$t('name')} required="indicator">
                <Input id="name" name="name" autocomplete="name" bind:value={name} />
              </Field>
            {/if}

            <Field label={$t('email')} required="indicator">
              <Input id="email" name="email" type="email" autocomplete="email" bind:value={email} />
            </Field>

            <Field label={$t('password')} required="indicator">
              <PasswordInput
                id="password"
                bind:value={password}
                autocomplete={isCreating ? 'new-password' : 'current-password'}
              />
            </Field>

            {#if isCreating}
              <Field label={$t('confirm_password')} required="indicator">
                <PasswordInput id="confirmPassword" bind:value={confirmPassword} autocomplete="new-password" />
              </Field>
            {/if}

            <Button type="submit" size="large" shape="round" fullWidth {loading} class="mt-6">
              {isCreating ? $t('create_account') : $t('to_login')}
            </Button>
          </form>

          {#if signUpEnabled}
            <div class="flex justify-center">
              <Button
                variant="ghost"
                color="primary"
                size="small"
                onclick={() => switchMode(isCreating ? 'signin' : 'create')}
              >
                {isCreating ? $t('already_have_an_account') : $t('create_account')}
              </Button>
            </div>
          {/if}
        {/if}

        {#if publicConfig.oauth.enabled && !isCreating}
          {#if publicConfig.passwordLogin.enabled}
            <div class="my-4 inline-flex w-full items-center justify-center">
              <hr class="my-4 h-px w-3/4 border-0 bg-gray-200 dark:bg-gray-600" />
              <span
                class="absolute inset-s-1/2 -translate-x-1/2 bg-gray-50 px-3 font-medium text-gray-900 uppercase dark:bg-neutral-900 dark:text-white"
              >
                {$t('or')}
              </span>
            </div>
          {/if}
          {#if oauthError}
            <Alert color="danger" title={oauthError} closable />
          {/if}
          <Button
            shape="round"
            loading={loading || oauthLoading}
            disabled={loading || oauthLoading}
            size="large"
            fullWidth
            color={publicConfig.passwordLogin.enabled ? 'secondary' : 'primary'}
            onclick={handleOAuthLogin}
          >
            {publicConfig.oauth.buttonText}
          </Button>
        {/if}

        {#if !publicConfig.passwordLogin.enabled && !publicConfig.oauth.enabled}
          <Alert color="warning" title={$t('login_has_been_disabled')} />
        {/if}
      {/if}
    </Stack>
  </AnimatedHeight>
</AuthPageLayout>
