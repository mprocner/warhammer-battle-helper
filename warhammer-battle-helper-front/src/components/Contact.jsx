import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
    Container,
    Box,
    Paper,
    Typography,
    TextField,
    Button,
    Alert,
    Link,
    Radio,
    RadioGroup,
    FormControl,
    FormLabel,
    FormControlLabel,
    Checkbox,
    CircularProgress,
} from '@mui/material';
import { Send as SendIcon } from '@mui/icons-material';
import { getApiUrl, getApiHeaders } from '../api/apiUrl';
import { CONTACT_EMAIL } from '../legal/legalInfo';
import usePageTitle from '../hooks/usePageTitle';

export const CONTACT_TYPES = ['bug', 'content', 'other'];

// Same caps as the backend (internal/http/ContactHandler.go).
const MAX = { name: 200, email: 254, subject: 150, message: 5000, contentLocation: 1000, justification: 5000 };

const EMPTY_FORM = {
    name: '',
    subject: '',
    message: '',
    contentLocation: '',
    justification: '',
    goodFaith: false,
    childAbuse: false,
    website: '',
};

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Mirrors ContactRequest.validate on the server, so the submit button only enables for a
// message the server will accept. A content report follows terms §4.
export const isContactFormValid = (type, form, email) => {
    const trimmedEmail = email.trim();
    if (trimmedEmail && !EMAIL_PATTERN.test(trimmedEmail)) return false;
    if (type !== 'content') return form.message.trim() !== '';
    if (!form.contentLocation.trim() || !form.justification.trim() || !form.goodFaith) return false;
    return form.childAbuse || (form.name.trim() !== '' && trimmedEmail !== '');
};

const initialType = (searchParams) => {
    const requested = searchParams.get('type');
    return CONTACT_TYPES.includes(requested) ? requested : 'bug';
};

// Public page: anyone, also without an account, can report a bug, report content or write to us.
// The backend mails the message to the service mailbox; nothing is stored. Form contents are
// never sent to analytics.
const Contact = ({ user }) => {
    const { t } = useTranslation();
    usePageTitle(t('pageTitle.contact'));
    const [searchParams] = useSearchParams();
    const [type, setType] = useState(() => initialType(searchParams));
    const [email, setEmail] = useState(user?.email || '');
    const [form, setForm] = useState(EMPTY_FORM);
    const [status, setStatus] = useState('idle'); // idle | sending | sent | error | tooMany
    const isContentReport = type === 'content';

    const setField = (name) => (e) => {
        const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!isContactFormValid(type, form, email) || status === 'sending') return;
        setStatus('sending');
        const token = localStorage.getItem('token');
        try {
            const res = await fetch(`${getApiUrl()}/contact`, {
                method: 'POST',
                headers: getApiHeaders({
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                }),
                body: JSON.stringify({ ...form, type, email: email.trim(), childAbuse: isContentReport && form.childAbuse }),
            });
            if (res.ok) {
                setStatus('sent');
            } else {
                setStatus(res.status === 429 ? 'tooMany' : 'error');
            }
        } catch {
            setStatus('error');
        }
    };

    const startOver = () => {
        setForm(EMPTY_FORM);
        setStatus('idle');
    };

    const mailLink = <Link href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</Link>;
    const identityRequired = isContentReport && !form.childAbuse;
    const sending = status === 'sending';

    return (
        <Container component="main" maxWidth="md">
            <Box sx={{ mt: 6, mb: 6 }}>
                <Paper elevation={3} sx={{ p: 4, borderRadius: 2 }}>
                    <Typography variant="h5" component="h1" sx={{ mb: 1 }}>
                        {t('contact.title')}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {t('contact.intro')} {mailLink}
                    </Typography>

                    {status === 'sent' ? (
                        <Box role="status">
                            <Alert severity="success" sx={{ mb: 2 }}>
                                {t(isContentReport ? 'contact.sentContent' : 'contact.sent')}
                            </Alert>
                            <Button variant="outlined" onClick={startOver}>
                                {t('contact.sendAnother')}
                            </Button>
                        </Box>
                    ) : (
                        <Box component="form" onSubmit={handleSubmit} noValidate>
                            <FormControl component="fieldset" sx={{ mb: 2 }}>
                                <FormLabel component="legend">{t('contact.typeLabel')}</FormLabel>
                                <RadioGroup row value={type} onChange={(e) => setType(e.target.value)}>
                                    {CONTACT_TYPES.map(value => (
                                        <FormControlLabel
                                            key={value}
                                            value={value}
                                            control={<Radio />}
                                            label={t(`contact.types.${value}`)}
                                        />
                                    ))}
                                </RadioGroup>
                            </FormControl>

                            {isContentReport && (
                                <Alert severity="info" sx={{ mb: 2 }}>
                                    {t('contact.contentIntro')}
                                </Alert>
                            )}

                            {isContentReport && (
                                <FormControlLabel
                                    control={<Checkbox checked={form.childAbuse} onChange={setField('childAbuse')} />}
                                    label={t('contact.childAbuse')}
                                />
                            )}

                            <TextField
                                margin="normal"
                                fullWidth
                                id="contact-name"
                                label={t(identityRequired ? 'contact.nameRequired' : 'contact.name')}
                                required={identityRequired}
                                autoComplete="name"
                                value={form.name}
                                onChange={setField('name')}
                                inputProps={{ maxLength: MAX.name }}
                                disabled={sending}
                            />
                            <TextField
                                margin="normal"
                                fullWidth
                                id="contact-email"
                                type="email"
                                label={t('contact.email')}
                                required={identityRequired}
                                helperText={identityRequired ? '' : t('contact.emailHint')}
                                autoComplete="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                inputProps={{ maxLength: MAX.email }}
                                disabled={sending}
                            />

                            {isContentReport ? (
                                <>
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        required
                                        multiline
                                        minRows={2}
                                        id="contact-location"
                                        label={t('contact.contentLocation')}
                                        helperText={t('contact.contentLocationHint', { email: CONTACT_EMAIL })}
                                        value={form.contentLocation}
                                        onChange={setField('contentLocation')}
                                        inputProps={{ maxLength: MAX.contentLocation }}
                                        disabled={sending}
                                    />
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        required
                                        multiline
                                        minRows={3}
                                        id="contact-justification"
                                        label={t('contact.justification')}
                                        value={form.justification}
                                        onChange={setField('justification')}
                                        inputProps={{ maxLength: MAX.justification }}
                                        disabled={sending}
                                    />
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        multiline
                                        minRows={2}
                                        id="contact-message"
                                        label={t('contact.additionalInfo')}
                                        value={form.message}
                                        onChange={setField('message')}
                                        inputProps={{ maxLength: MAX.message }}
                                        disabled={sending}
                                    />
                                    <FormControlLabel
                                        sx={{ mt: 1, alignItems: 'flex-start' }}
                                        control={<Checkbox checked={form.goodFaith} onChange={setField('goodFaith')} required />}
                                        label={t('contact.goodFaith')}
                                    />
                                </>
                            ) : (
                                <>
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        id="contact-subject"
                                        label={t('contact.subject')}
                                        value={form.subject}
                                        onChange={setField('subject')}
                                        inputProps={{ maxLength: MAX.subject }}
                                        disabled={sending}
                                    />
                                    <TextField
                                        margin="normal"
                                        fullWidth
                                        required
                                        multiline
                                        minRows={5}
                                        id="contact-message"
                                        label={t('contact.message')}
                                        helperText={type === 'bug' ? t('contact.bugHint') : ''}
                                        value={form.message}
                                        onChange={setField('message')}
                                        inputProps={{ maxLength: MAX.message }}
                                        disabled={sending}
                                    />
                                </>
                            )}

                            {/* Honeypot: invisible to people (off-screen, skipped by Tab and screen
                                readers), filled in by bots. The server drops such messages. */}
                            <Box aria-hidden="true" sx={{ position: 'absolute', left: '-10000px', width: 1, height: 1, overflow: 'hidden' }}>
                                <label htmlFor="contact-website">Website</label>
                                <input
                                    id="contact-website"
                                    name="website"
                                    type="text"
                                    tabIndex={-1}
                                    autoComplete="off"
                                    value={form.website}
                                    onChange={setField('website')}
                                />
                            </Box>

                            {status === 'error' && (
                                <Alert severity="error" sx={{ mt: 2 }}>
                                    {t('contact.error')} {mailLink}
                                </Alert>
                            )}
                            {status === 'tooMany' && (
                                <Alert severity="warning" sx={{ mt: 2 }}>
                                    {t('contact.tooMany')} {mailLink}
                                </Alert>
                            )}

                            <Button
                                type="submit"
                                variant="contained"
                                sx={{ mt: 3, py: 1.25 }}
                                disabled={sending || !isContactFormValid(type, form, email)}
                                startIcon={sending ? <CircularProgress size={20} /> : <SendIcon />}
                            >
                                {sending ? t('contact.sending') : t('contact.submit')}
                            </Button>
                        </Box>
                    )}
                </Paper>
            </Box>
        </Container>
    );
};

export default Contact;
