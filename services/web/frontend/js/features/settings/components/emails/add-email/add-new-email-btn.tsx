import { useTranslation } from 'react-i18next'
import OLButton, { OLButtonProps } from '@/features/ui/components/ol/ol-button'

const isValidEmail = (email: string) => {
  return Boolean(email)
}

type AddNewEmailColProps = {
  email: string
} & OLButtonProps

function AddNewEmailBtn({
  email,
  disabled,
  isLoading,
  ...props
}: AddNewEmailColProps) {
  const { t } = useTranslation()

  return (
    <OLButton
      size="small"
      variant="primary"
      disabled={(disabled && !isLoading) || !isValidEmail(email)}
      isLoading={isLoading}
      {...props}
    >
      {t('add_new_email')}
    </OLButton>
  )
}

export default AddNewEmailBtn
